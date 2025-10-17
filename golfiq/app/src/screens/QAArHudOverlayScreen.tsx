import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  getBundle,
  getIndex,
  getLastBundleFetchMeta,
  type BundleIndexEntry,
  type CourseBundle,
} from '../../../../shared/arhud/bundle_client';
import {
  distancePointToLineString,
  distancePointToPolygonEdge,
  toLocalENU,
  type LocalPoint,
} from '../../../../shared/arhud/geo';
import { createCameraStub, type CameraFrame } from '../../../../shared/arhud/native/camera_stub';
import { subscribeHeading } from '../../../../shared/arhud/native/heading';
import { qaHudEnabled } from '../../../../shared/arhud/native/qa_gate';

type FeatureKind = 'green' | 'fairway' | 'bunker' | 'hazard' | 'cartpath' | 'other';

type LocalSegment = {
  start: LocalPoint;
  end: LocalPoint;
};

type OverlayFeature = {
  id: string;
  kind: FeatureKind;
  segments: LocalSegment[];
  polygonRings: number[][][];
};

type OverlayData = {
  features: OverlayFeature[];
  points: LocalPoint[];
};

type CameraStats = {
  latency: number;
  fps: number;
};

type OptionalFileSystemModule = {
  documentDirectory?: string | null;
  getInfoAsync?: (path: string) => Promise<{ exists: boolean; isFile?: boolean }>;
  makeDirectoryAsync?: (path: string, options?: { intermediates?: boolean }) => Promise<void>;
  readAsStringAsync?: (path: string) => Promise<string>;
  writeAsStringAsync?: (path: string, contents: string) => Promise<void>;
};

const FEATURE_COLORS: Record<FeatureKind, string> = {
  green: '#16a34a',
  fairway: '#22c55e',
  bunker: '#facc15',
  hazard: '#ef4444',
  cartpath: '#94a3b8',
  other: '#cbd5f5',
};

const FEATURE_STROKES: Record<FeatureKind, number> = {
  green: 6,
  fairway: 5,
  bunker: 4,
  hazard: 4,
  cartpath: 6,
  other: 3,
};

const HAZARD_KINDS: readonly FeatureKind[] = ['bunker', 'hazard'];

let lastSelectedCourseMemory: string | null = null;

async function loadFileSystem(): Promise<OptionalFileSystemModule | null> {
  try {
    const mod = (await import('expo-file-system')) as OptionalFileSystemModule;
    return mod ?? null;
  } catch (error) {
    return null;
  }
}

async function loadLastSelectedCourse(): Promise<string | null> {
  if (lastSelectedCourseMemory) {
    return lastSelectedCourseMemory;
  }
  const FileSystem = await loadFileSystem();
  if (!FileSystem?.documentDirectory || !FileSystem.readAsStringAsync || !FileSystem.getInfoAsync) {
    return null;
  }
  const base = FileSystem.documentDirectory.replace(/\/+$/, '');
  const path = `${base}/qa-overlay/last-course.json`;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isFile === false) {
      return null;
    }
    const contents = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(contents) as { courseId?: unknown };
    if (parsed && typeof parsed.courseId === 'string' && parsed.courseId) {
      lastSelectedCourseMemory = parsed.courseId;
      return parsed.courseId;
    }
  } catch (error) {
    return null;
  }
  return null;
}

async function persistLastSelectedCourse(courseId: string): Promise<void> {
  lastSelectedCourseMemory = courseId;
  const FileSystem = await loadFileSystem();
  if (!FileSystem?.documentDirectory || !FileSystem.writeAsStringAsync) {
    return;
  }
  const base = FileSystem.documentDirectory.replace(/\/+$/, '');
  const directory = `${base}/qa-overlay`;
  try {
    if (FileSystem.makeDirectoryAsync) {
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    }
    const path = `${directory}/last-course.json`;
    await FileSystem.writeAsStringAsync(path, JSON.stringify({ courseId }));
  } catch (error) {
    // ignore persistence errors
  }
}

function normalizeFeatureKind(value: unknown): FeatureKind {
  if (typeof value !== 'string') {
    return 'other';
  }
  const token = value.trim().toLowerCase();
  if (token.includes('green')) {
    return 'green';
  }
  if (token.includes('fairway')) {
    return 'fairway';
  }
  if (token.includes('bunker')) {
    return 'bunker';
  }
  if (token.includes('hazard') || token.includes('water')) {
    return 'hazard';
  }
  if (token.includes('cart')) {
    return 'cartpath';
  }
  return 'other';
}

function toLocalPoint(origin: { lat: number; lon: number }, coord: [number, number]): LocalPoint {
  const [lon, lat] = coord;
  return toLocalENU(origin, { lat, lon });
}

function firstCoordinateFromGeometry(geometry: { type?: string; coordinates?: unknown }): [number, number] | null {
  if (!geometry || typeof geometry.type !== 'string') {
    return null;
  }
  const type = geometry.type.toLowerCase();
  const coords = geometry.coordinates;
  if (!coords) {
    return null;
  }
  if (type === 'point' && Array.isArray(coords) && coords.length >= 2) {
    return [Number(coords[0]), Number(coords[1])];
  }
  if (type === 'linestring' && Array.isArray(coords) && coords.length) {
    const first = coords[0] as [number, number];
    return Array.isArray(first) && first.length >= 2 ? [Number(first[0]), Number(first[1])] : null;
  }
  if (type === 'polygon' && Array.isArray(coords) && coords.length) {
    const ring = coords[0] as unknown;
    if (Array.isArray(ring) && ring.length) {
      const first = ring[0] as [number, number];
      return Array.isArray(first) && first.length >= 2 ? [Number(first[0]), Number(first[1])] : null;
    }
  }
  if (type === 'multipolygon' && Array.isArray(coords) && coords.length) {
    const polygon = coords[0] as unknown;
    if (Array.isArray(polygon) && polygon.length) {
      const ring = polygon[0] as unknown;
      if (Array.isArray(ring) && ring.length) {
        const first = ring[0] as [number, number];
        return Array.isArray(first) && first.length >= 2 ? [Number(first[0]), Number(first[1])] : null;
      }
    }
  }
  return null;
}

function deriveOrigin(
  bundle: CourseBundle,
  course: BundleIndexEntry | null,
): { lat: number; lon: number } {
  if (course) {
    const [minLon, minLat, maxLon, maxLat] = course.bbox;
    if (
      Number.isFinite(minLat) &&
      Number.isFinite(minLon) &&
      Number.isFinite(maxLat) &&
      Number.isFinite(maxLon)
    ) {
      return {
        lat: (minLat + maxLat) / 2,
        lon: (minLon + maxLon) / 2,
      };
    }
  }
  for (const feature of bundle.features) {
    const geometry = feature && typeof feature === 'object' ? (feature as { geometry?: unknown }).geometry : null;
    if (geometry && typeof geometry === 'object') {
      const first = firstCoordinateFromGeometry(geometry as { type?: string; coordinates?: unknown });
      if (first) {
        const [lon, lat] = first;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          return { lat, lon };
        }
      }
    }
  }
  return { lat: 0, lon: 0 };
}

function buildOverlayData(
  bundle: CourseBundle | null,
  course: BundleIndexEntry | null,
): OverlayData {
  if (!bundle) {
    return { features: [], points: [] };
  }
  const origin = deriveOrigin(bundle, course);
  const features: OverlayFeature[] = [];
  const points: LocalPoint[] = [];

  const appendSegment = (segments: LocalSegment[], start: LocalPoint, end: LocalPoint) => {
    segments.push({ start, end });
    points.push(start, end);
  };

  bundle.features.forEach((raw, idx) => {
    if (!raw || typeof raw !== 'object') {
      return;
    }
    const record = raw as Record<string, unknown>;
    const geometry = record.geometry as { type?: string; coordinates?: unknown } | undefined;
    if (!geometry || typeof geometry.type !== 'string') {
      return;
    }
    const featureId = typeof record.id === 'string' ? record.id : `feature-${idx}`;
    const kindSource = record.type ?? (record.properties as { kind?: unknown } | undefined)?.kind;
    const kind = normalizeFeatureKind(kindSource);
    const overlay: OverlayFeature = {
      id: featureId,
      kind,
      segments: [],
      polygonRings: [],
    };
    const type = geometry.type.toLowerCase();
    const coords = geometry.coordinates;
    if (!coords) {
      return;
    }
    if (type === 'polygon' && Array.isArray(coords)) {
      for (const ring of coords as unknown[]) {
        if (!Array.isArray(ring) || ring.length < 2) {
          continue;
        }
        const localRing: LocalPoint[] = [];
        for (const coord of ring as unknown[]) {
          if (!Array.isArray(coord) || coord.length < 2) {
            continue;
          }
          const local = toLocalPoint(origin, [Number(coord[0]), Number(coord[1])]);
          localRing.push(local);
          points.push(local);
        }
        if (!localRing.length) {
          continue;
        }
        overlay.polygonRings.push(localRing.map((pt) => [pt.x, pt.y]));
        for (let i = 0; i < localRing.length; i += 1) {
          const current = localRing[i];
          const next = localRing[(i + 1) % localRing.length];
          appendSegment(overlay.segments, current, next);
        }
      }
    } else if (type === 'multipolygon' && Array.isArray(coords)) {
      for (const polygon of coords as unknown[]) {
        if (!Array.isArray(polygon)) {
          continue;
        }
        (polygon as unknown[]).forEach((ring) => {
          if (!Array.isArray(ring) || ring.length < 2) {
            return;
          }
          const localRing: LocalPoint[] = [];
          for (const coord of ring as unknown[]) {
            if (!Array.isArray(coord) || coord.length < 2) {
              continue;
            }
            const local = toLocalPoint(origin, [Number(coord[0]), Number(coord[1])]);
            localRing.push(local);
            points.push(local);
          }
          if (!localRing.length) {
            return;
          }
          overlay.polygonRings.push(localRing.map((pt) => [pt.x, pt.y]));
          for (let i = 0; i < localRing.length; i += 1) {
            const current = localRing[i];
            const next = localRing[(i + 1) % localRing.length];
            appendSegment(overlay.segments, current, next);
          }
        });
      }
    } else if (type === 'linestring' && Array.isArray(coords)) {
      const localLine: LocalPoint[] = [];
      for (const coord of coords as unknown[]) {
        if (!Array.isArray(coord) || coord.length < 2) {
          continue;
        }
        const local = toLocalPoint(origin, [Number(coord[0]), Number(coord[1])]);
        localLine.push(local);
        points.push(local);
      }
      for (let i = 0; i < localLine.length - 1; i += 1) {
        appendSegment(overlay.segments, localLine[i], localLine[i + 1]);
      }
    } else if (type === 'multilinestring' && Array.isArray(coords)) {
      for (const line of coords as unknown[]) {
        if (!Array.isArray(line)) {
          continue;
        }
        const localLine: LocalPoint[] = [];
        for (const coord of line as unknown[]) {
          if (!Array.isArray(coord) || coord.length < 2) {
            continue;
          }
          const local = toLocalPoint(origin, [Number(coord[0]), Number(coord[1])]);
          localLine.push(local);
          points.push(local);
        }
        for (let i = 0; i < localLine.length - 1; i += 1) {
          appendSegment(overlay.segments, localLine[i], localLine[i + 1]);
        }
      }
    }
    if (overlay.segments.length || overlay.polygonRings.length) {
      features.push(overlay);
    }
  });

  return { features, points };
}

type MapOverlayProps = {
  data: OverlayData;
  player: LocalPoint;
  heading: number;
  offline: boolean;
  nearestHazard: number | null;
};

const MapOverlay: React.FC<MapOverlayProps> = ({ data, player, heading, offline, nearestHazard }) => {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 32, 340);
  const padding = 20;
  const allPoints = data.points.length ? data.points.concat(player) : [player];
  const bounds = allPoints.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y),
    }),
    { minX: 0, maxX: 0, minY: 0, maxY: 0 },
  );
  const extentX = bounds.maxX - bounds.minX;
  const extentY = bounds.maxY - bounds.minY;
  const maxExtent = Math.max(extentX, extentY, 20);
  const scale = (size - padding * 2) / maxExtent;
  const center = {
    x: (bounds.maxX + bounds.minX) / 2,
    y: (bounds.maxY + bounds.minY) / 2,
  };
  const toScreen = (point: LocalPoint) => ({
    x: size / 2 + (point.x - center.x) * scale,
    y: size / 2 - (point.y - center.y) * scale,
  });
  const playerScreen = toScreen(player);

  const headingRad = (heading * Math.PI) / 180;
  const headingRadius = (size - padding * 2) / 2;
  const headingPos = {
    x: size / 2 + Math.sin(headingRad) * headingRadius,
    y: size / 2 - Math.cos(headingRad) * headingRadius,
  };

  return (
    <View style={[styles.mapContainer, { width: size, height: size }]} pointerEvents="none">
      <View style={styles.mapBackground} />
      {data.features.map((feature) =>
        feature.segments.map((segment, idx) => {
          const start = toScreen(segment.start);
          const end = toScreen(segment.end);
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const length = Math.hypot(dx, dy);
          if (!Number.isFinite(length) || length < 1) {
            return null;
          }
          const midX = (start.x + end.x) / 2;
          const midY = (start.y + end.y) / 2;
          const angle = Math.atan2(dy, dx);
          const stroke = FEATURE_STROKES[feature.kind] ?? 3;
          return (
            <View
              key={`${feature.id}-segment-${idx}`}
              style={{
                position: 'absolute',
                left: midX,
                top: midY,
                width: length,
                height: stroke,
                backgroundColor: FEATURE_COLORS[feature.kind] ?? FEATURE_COLORS.other,
                opacity: 0.75,
                borderRadius: stroke / 2,
                transform: [
                  { translateX: -length / 2 },
                  { translateY: -stroke / 2 },
                  { rotate: `${angle}rad` },
                ],
              }}
            />
          );
        }),
      )}
      <View
        style={{
          position: 'absolute',
          left: playerScreen.x,
          top: playerScreen.y,
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: '#2563eb',
          borderWidth: 2,
          borderColor: '#ffffff',
          transform: [{ translateX: -8 }, { translateY: -8 }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: headingPos.x,
          top: headingPos.y,
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: '#f97316',
          borderWidth: 2,
          borderColor: '#0f172a',
          transform: [{ translateX: -6 }, { translateY: -6 }],
        }}
      />
      {offline ? (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineBadgeText}>Offline</Text>
        </View>
      ) : null}
      <View style={styles.hazardBadge}>
        <Text style={styles.hazardLabel}>Nearest hazard</Text>
        <Text style={styles.hazardValue}>
          {nearestHazard !== null ? `${nearestHazard.toFixed(1)} m` : '—'}
        </Text>
      </View>
    </View>
  );
};

type CoursePickerProps = {
  courses: BundleIndexEntry[];
  selected: string | null;
  loading: boolean;
  onSelect: (courseId: string) => void;
  onRefresh: () => void;
  error: string | null;
};

const CoursePicker: React.FC<CoursePickerProps> = ({
  courses,
  selected,
  loading,
  onSelect,
  onRefresh,
  error,
}) => {
  return (
    <View style={styles.pickerContainer}>
      <View style={styles.pickerHeader}>
        <Text style={styles.sectionTitle}>Courses</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="small" color="#60a5fa" /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.courseScroll}>
        {courses.map((course) => {
          const isSelected = course.courseId === selected;
          return (
            <TouchableOpacity
              key={course.courseId}
              onPress={() => onSelect(course.courseId)}
              style={[
                styles.courseButton,
                isSelected ? styles.courseButtonActive : null,
              ]}
            >
              <Text style={[styles.courseButtonText, isSelected ? styles.courseButtonTextActive : null]}>
                {course.name ?? course.courseId}
              </Text>
            </TouchableOpacity>
          );
        })}
        {!courses.length && !loading && !error ? (
          <Text style={styles.placeholderText}>No bundles yet</Text>
        ) : null}
      </ScrollView>
    </View>
  );
};

const QAArHudOverlayScreen: React.FC = () => {
  const qaEnabled = qaHudEnabled();
  const [courses, setCourses] = useState<BundleIndexEntry[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [playerPosition, setPlayerPosition] = useState<LocalPoint>({ x: 0, y: 0 });
  const [heading, setHeading] = useState(0);
  const [nearestHazard, setNearestHazard] = useState<number | null>(null);
  const overlayData = useMemo(
    () => buildOverlayData(bundle, courses.find((c) => c.courseId === selectedCourseId) ?? null),
    [bundle, courses, selectedCourseId],
  );
  const playerRef = useRef(playerPosition);
  const featuresRef = useRef(overlayData.features);
  const camera = useMemo(() => createCameraStub({ fps: 15 }), []);
  const [cameraStats, setCameraStats] = useState<CameraStats>({ latency: 0, fps: 0 });

  useEffect(() => {
    playerRef.current = playerPosition;
  }, [playerPosition]);

  useEffect(() => {
    featuresRef.current = overlayData.features;
  }, [overlayData.features]);

  useEffect(() => {
    if (!qaEnabled) {
      return;
    }
    let cancelled = false;
    setCoursesLoading(true);
    setCoursesError(null);
    (async () => {
      try {
        const index = await getIndex();
        if (cancelled) {
          return;
        }
        setCourses(index);
        setCoursesLoading(false);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setCoursesError(error instanceof Error ? error.message : 'Failed to load index');
        setCoursesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qaEnabled]);

  useEffect(() => {
    if (!qaEnabled || !courses.length) {
      return;
    }
    let active = true;
    (async () => {
      const saved = await loadLastSelectedCourse();
      if (active && saved && courses.some((course) => course.courseId === saved)) {
        setSelectedCourseId(saved);
      }
    })();
    return () => {
      active = false;
    };
  }, [qaEnabled, courses]);

  useEffect(() => {
    if (!qaEnabled || !selectedCourseId) {
      setBundle(null);
      setBundleError(null);
      return;
    }
    let cancelled = false;
    setBundleLoading(true);
    setBundleError(null);
    (async () => {
      try {
        const next = await getBundle(selectedCourseId);
        if (cancelled) {
          return;
        }
        setBundle(next);
        setBundleLoading(false);
        const meta = getLastBundleFetchMeta(selectedCourseId);
        setOffline(meta?.fromCache ?? false);
        persistLastSelectedCourse(selectedCourseId).catch(() => {
          // ignore persistence errors
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setBundleError(error instanceof Error ? error.message : 'Failed to load bundle');
        setBundleLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qaEnabled, selectedCourseId]);

  useEffect(() => {
    if (!qaEnabled) {
      return undefined;
    }
    const unsubscribe = subscribeHeading((value) => {
      setHeading(value);
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [qaEnabled]);

  useEffect(() => {
    if (!qaEnabled) {
      return undefined;
    }
    let mounted = true;
    let frames = 0;
    let windowStart = Date.now();
    const onFrame = (frame: CameraFrame) => {
      if (!mounted) {
        return;
      }
      frames += 1;
      const now = Date.now();
      if (now - windowStart >= 1000) {
        const fps = frames / ((now - windowStart) / 1000);
        frames = 0;
        windowStart = now;
        setCameraStats((prev) => ({ ...prev, fps }));
      }
      setCameraStats((prev) => ({ ...prev, latency: frame.latencyMs }));
    };
    camera
      .start(onFrame)
      .catch(() => {
        // ignore camera start errors in dev
      });
    return () => {
      mounted = false;
      camera.stop();
    };
  }, [camera, qaEnabled]);

  useEffect(() => {
    setPlayerPosition((prev) => {
      if (!overlayData.points.length) {
        return prev;
      }
      if (!selectedCourseId) {
        return prev;
      }
      const centroid = overlayData.points.reduce(
        (acc, point) => ({
          x: acc.x + point.x,
          y: acc.y + point.y,
        }),
        { x: 0, y: 0 },
      );
      const next = {
        x: centroid.x / overlayData.points.length,
        y: centroid.y / overlayData.points.length,
      };
      return next;
    });
  }, [overlayData.points.length, selectedCourseId]);

  useEffect(() => {
    if (!qaEnabled) {
      return undefined;
    }
    const interval = setInterval(() => {
      const position = playerRef.current;
      const features = featuresRef.current;
      let minDistance: number | null = null;
      for (const feature of features) {
        if (!HAZARD_KINDS.includes(feature.kind)) {
          continue;
        }
        if (feature.polygonRings.length) {
          const candidate = distancePointToPolygonEdge(position, {
            rings: feature.polygonRings,
          });
          if (Number.isFinite(candidate)) {
            minDistance = minDistance === null ? candidate : Math.min(minDistance, candidate);
          }
        }
        if (feature.segments.length) {
          const line: LocalPoint[] = [];
          feature.segments.forEach((segment, idx) => {
            if (idx === 0) {
              line.push(segment.start);
            }
            line.push(segment.end);
          });
          if (line.length >= 2) {
            const candidate = distancePointToLineString(position, line);
            if (Number.isFinite(candidate)) {
              minDistance = minDistance === null ? candidate : Math.min(minDistance, candidate);
            }
          }
        }
      }
      setNearestHazard(minDistance !== null ? minDistance : null);
    }, 200);
    return () => {
      clearInterval(interval);
    };
  }, [qaEnabled]);

  const handleCourseSelect = useCallback(
    (courseId: string) => {
      setSelectedCourseId(courseId);
    },
    [],
  );

  const handleRefresh = useCallback(() => {
    if (!qaEnabled) {
      return;
    }
    setCoursesLoading(true);
    setCoursesError(null);
    (async () => {
      try {
        const index = await getIndex();
        setCourses(index);
        setCoursesLoading(false);
      } catch (error) {
        setCoursesError(error instanceof Error ? error.message : 'Failed to load index');
        setCoursesLoading(false);
      }
    })();
  }, [qaEnabled]);

  if (!qaEnabled) {
    return null;
  }

  return (
    <View style={styles.container}>
      <CoursePicker
        courses={courses}
        selected={selectedCourseId}
        loading={coursesLoading}
        onSelect={handleCourseSelect}
        onRefresh={handleRefresh}
        error={coursesError}
      />
      <View style={styles.cameraSection}>
        <View style={styles.cameraStub}>
          <Text style={styles.cameraLabel}>Camera stub</Text>
          <Text style={styles.cameraStat}>FPS: {cameraStats.fps.toFixed(1)}</Text>
          <Text style={styles.cameraStat}>Latency: {cameraStats.latency.toFixed(0)} ms</Text>
        </View>
        <View style={styles.overlayWrapper}>
          <MapOverlay
            data={overlayData}
            player={playerPosition}
            heading={heading}
            offline={offline}
            nearestHazard={nearestHazard}
          />
        </View>
      </View>
      <View style={styles.statusPanel}>
        <Text style={styles.sectionTitle}>Bundle</Text>
        {bundleLoading ? <ActivityIndicator size="small" color="#60a5fa" /> : null}
        {bundleError ? <Text style={styles.errorText}>{bundleError}</Text> : null}
        {bundle && !bundleLoading ? (
          <View style={styles.bundleDetails}>
            <Text style={styles.bundleLine}>Course: {bundle.courseId}</Text>
            <Text style={styles.bundleLine}>Version: {bundle.version}</Text>
            <Text style={styles.bundleLine}>TTL: {bundle.ttlSec}s</Text>
            <Text style={styles.bundleLine}>Features: {bundle.features.length}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 16,
  },
  pickerContainer: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '600',
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1d4ed8',
  },
  refreshText: {
    color: '#f8fafc',
    fontWeight: '500',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
  },
  placeholderText: {
    color: '#9ca3af',
    paddingVertical: 8,
  },
  courseScroll: {
    flexGrow: 0,
  },
  courseButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1f2937',
    marginRight: 8,
  },
  courseButtonActive: {
    backgroundColor: '#2563eb',
  },
  courseButtonText: {
    color: '#e5e7eb',
    fontWeight: '500',
  },
  courseButtonTextActive: {
    color: '#ffffff',
  },
  cameraSection: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    overflow: 'hidden',
  },
  cameraStub: {
    padding: 16,
    backgroundColor: '#0b1120',
  },
  cameraLabel: {
    color: '#e2e8f0',
    fontWeight: '600',
    fontSize: 14,
  },
  cameraStat: {
    color: '#cbd5f5',
    fontSize: 12,
    marginTop: 2,
  },
  overlayWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  statusPanel: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  bundleDetails: {
    gap: 4,
  },
  bundleLine: {
    color: '#e5e7eb',
    fontSize: 13,
  },
  mapContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  mapBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b1120',
  },
  offlineBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#f97316',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  offlineBadgeText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 10,
  },
  hazardBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  hazardLabel: {
    color: '#cbd5f5',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  hazardValue: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default QAArHudOverlayScreen;

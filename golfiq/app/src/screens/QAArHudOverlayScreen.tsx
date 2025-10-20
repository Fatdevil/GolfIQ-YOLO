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
  Switch,
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
  AutoCourseController,
  type AutoCourseCandidate,
} from '../../../../shared/arhud/auto_course';
import {
  nearestFeature,
  toLocalENU,
  type GeoPoint,
  type LocalPoint,
} from '../../../../shared/arhud/geo';
import { getLocation, LocationError } from '../../../../shared/arhud/location';
import { createCameraStub, type CameraFrame } from '../../../../shared/arhud/native/camera_stub';
import { subscribeHeading } from '../../../../shared/arhud/native/heading';
import { qaHudEnabled } from '../../../../shared/arhud/native/qa_gate';
import { computePlaysLike, type PlanOut } from '../../../../shared/playslike/aggregate';
import { addShot as addRoundShot, getActiveRound as getActiveRoundState } from '../../../../shared/round/round_store';
import type { Shot as RoundShot } from '../../../../shared/round/round_types';
import {
  CLUB_SEQUENCE,
  defaultBag,
  effectiveBag,
  getUserBag,
  saveUserBag,
  suggestClub,
  type Bag,
  type ClubId,
} from '../../../../shared/playslike/bag';
import {
  calibrate,
  type CalibOut,
  type Shot as CalibrateShot,
} from '../../../../shared/playslike/bag_calibrator';

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

type PlannerInputKey =
  | 'temperatureC'
  | 'altitude_m'
  | 'wind_mps'
  | 'wind_from_deg'
  | 'slope_dh_m';

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

const EARTH_RADIUS_M = 6_378_137;

type TelemetryEmitter = (event: string, data: Record<string, unknown>) => void;

type HazardDirection = 'LEFT' | 'RIGHT';

type ShotLogRecord = {
  tStart: number;
  tEnd: number;
  shotId: string;
  club: string | null;
  base_m: number | null;
  playsLike_m: number | null;
  deltas: {
    temp: number | null;
    alt: number | null;
    head: number | null;
    slope: number | null;
  };
  pin: { lat: number; lon: number } | null;
  land: { lat: number; lon: number } | null;
  carry_m: number | null;
  heading_deg: number | null;
  notes?: string | null;
};

type ShotSessionState = {
  shotId: string;
  startedAt: number;
  headingDeg: number;
  baseDistance: number;
  origin: LocalPoint;
  plan: PlanOut;
  club: string | null;
  pin: GeoPoint | null;
  landing?: LocalPoint;
  completedAt?: number;
  logged?: boolean;
};

type AutoPickPrompt = {
  candidate: AutoCourseCandidate;
  shownAt: number;
};

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatDistanceMeters(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return '—';
  }
  const meters = Number(value);
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  if (meters >= 100) {
    return `${meters.toFixed(0)} m`;
  }
  return `${meters.toFixed(1)} m`;
}

let lastSelectedCourseMemory: string | null = null;

function resolveTelemetryEmitter(): TelemetryEmitter | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  const holder = globalThis as { __ARHUD_QA_TELEMETRY__?: unknown };
  const candidate = holder.__ARHUD_QA_TELEMETRY__;
  return typeof candidate === 'function' ? (candidate as TelemetryEmitter) : null;
}

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

function mapHudRecordToRoundShot(record: ShotLogRecord): RoundShot | null {
  if (!record || !record.pin) {
    return null;
  }
  const tStart = Number(record.tStart);
  if (!Number.isFinite(tStart)) {
    return null;
  }
  const pinLat = Number(record.pin.lat);
  const pinLon = Number(record.pin.lon);
  if (!Number.isFinite(pinLat) || !Number.isFinite(pinLon)) {
    return null;
  }
  const base = typeof record.base_m === 'number' && Number.isFinite(record.base_m) ? record.base_m : undefined;
  const playsLike = typeof record.playsLike_m === 'number' && Number.isFinite(record.playsLike_m) ? record.playsLike_m : base;
  const shot: RoundShot = {
    tStart,
    club: record.club ?? 'UNK',
    base_m: base ?? 0,
    playsLike_m: playsLike ?? 0,
    pin: { lat: pinLat, lon: pinLon },
  };
  if (typeof record.tEnd === 'number' && Number.isFinite(record.tEnd)) {
    shot.tEnd = record.tEnd;
  }
  if (typeof record.carry_m === 'number' && Number.isFinite(record.carry_m)) {
    shot.carry_m = record.carry_m;
  }
  if (record.land && typeof record.land === 'object') {
    const landLat = Number((record.land as { lat?: number }).lat);
    const landLon = Number((record.land as { lon?: number }).lon);
    if (Number.isFinite(landLat) && Number.isFinite(landLon)) {
      shot.land = { lat: landLat, lon: landLon };
    }
  }
  return shot;
}

async function appendHudRunShot(record: ShotLogRecord): Promise<void> {
  const FileSystem = await loadFileSystem();
  if (!FileSystem?.documentDirectory || !FileSystem.writeAsStringAsync) {
    return;
  }
  const base = FileSystem.documentDirectory.replace(/\/+$/, '');
  const path = `${base}/hud_run.json`;
  let records: unknown[] | null = null;
  if (!FileSystem.readAsStringAsync) {
    if (FileSystem.getInfoAsync) {
      try {
        const info = await FileSystem.getInfoAsync(path);
        if (info.exists && info.isFile !== false) {
          return;
        }
      } catch (error) {
        // ignore stat errors
      }
    }
    records = [];
  } else {
    try {
      const contents = await FileSystem.readAsStringAsync(path);
      const parsed = JSON.parse(contents);
      if (Array.isArray(parsed)) {
        records = parsed;
      } else {
        return;
      }
    } catch (error) {
      if (FileSystem.getInfoAsync) {
        try {
          const info = await FileSystem.getInfoAsync(path);
          if (info.exists && info.isFile !== false) {
            return;
          }
        } catch (statError) {
          // ignore stat errors when determining file existence
        }
      }
      records = [];
    }
  }
  if (!records) {
    records = [];
  }
  records.push(record);
  try {
    await FileSystem.writeAsStringAsync(path, JSON.stringify(records, null, 2));
  } catch (error) {
    // ignore write errors
  }
}

async function loadHudRunShots(): Promise<ShotLogRecord[]> {
  const FileSystem = await loadFileSystem();
  if (!FileSystem?.documentDirectory || !FileSystem.readAsStringAsync) {
    return [];
  }
  const base = FileSystem.documentDirectory.replace(/\/+$/, '');
  const path = `${base}/hud_run.json`;
  try {
    const contents = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(contents);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is ShotLogRecord => {
      return Boolean(item && typeof item === 'object');
    });
  } catch (error) {
    return [];
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

function fromLocalPoint(origin: { lat: number; lon: number }, point: LocalPoint): GeoPoint {
  const lat0 = Number.isFinite(origin.lat) ? origin.lat : 0;
  const lon0 = Number.isFinite(origin.lon) ? origin.lon : 0;
  const latRad = (lat0 * Math.PI) / 180;
  const lat = lat0 + ((point.y / EARTH_RADIUS_M) * 180) / Math.PI;
  const denom = Math.cos(latRad) || 1;
  const lon = lon0 + ((point.x / (EARTH_RADIUS_M * denom)) * 180) / Math.PI;
  return { lat, lon };
}

function directionFromBearing(bearing: number, heading: number): HazardDirection {
  const delta = ((bearing - heading + 540) % 360) - 180;
  return delta < 0 ? 'LEFT' : 'RIGHT';
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
  hazard: { distance: number; direction: HazardDirection } | null;
  markLandingActive: boolean;
  onSelectLanding?: (point: LocalPoint) => void;
  landing?: LocalPoint | null;
};

const MapOverlay: React.FC<MapOverlayProps> = ({
  data,
  player,
  heading,
  offline,
  hazard,
  markLandingActive,
  onSelectLanding,
  landing,
}) => {
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

  const handleRelease = useCallback(
    (event: {
      nativeEvent: { locationX: number; locationY: number };
    }) => {
      if (!markLandingActive || !onSelectLanding) {
        return;
      }
      const { locationX, locationY } = event.nativeEvent;
      const relativeX = locationX - size / 2;
      const relativeY = locationY - size / 2;
      const localX = center.x + relativeX / scale;
      const localY = center.y - relativeY / scale;
      onSelectLanding({ x: localX, y: localY });
    },
    [center.x, center.y, markLandingActive, onSelectLanding, scale, size],
  );

  return (
    <View
      style={[styles.mapContainer, { width: size, height: size }]}
      pointerEvents="auto"
      onStartShouldSetResponder={() => markLandingActive}
      onResponderRelease={handleRelease}
    >
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
      {landing ? (
        <View
          style={{
            position: 'absolute',
            left: toScreen(landing).x,
            top: toScreen(landing).y,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: '#f472b6',
            borderWidth: 2,
            borderColor: '#0f172a',
            transform: [{ translateX: -7 }, { translateY: -7 }],
          }}
        />
      ) : null}
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
      {markLandingActive ? (
        <View style={styles.markLandingBadge}>
          <Text style={styles.markLandingText}>Tap map to mark landing</Text>
        </View>
      ) : null}
      <View style={styles.hazardBadge}>
        <Text style={styles.hazardLabel}>Nearest hazard</Text>
        <Text style={styles.hazardValue}>
          {hazard ? `${hazard.distance.toFixed(1)} m ${hazard.direction}` : '—'}
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
  const autoCourseRef = useRef<AutoCourseController | null>(null);
  if (!autoCourseRef.current) {
    autoCourseRef.current = new AutoCourseController();
  }
  const [courses, setCourses] = useState<BundleIndexEntry[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<CourseBundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [autoPickEnabled, setAutoPickEnabled] = useState(false);
  const [autoPickAvailable, setAutoPickAvailable] = useState(true);
  const [autoPickCandidate, setAutoPickCandidate] = useState<AutoCourseCandidate | null>(null);
  const [autoPickPrompt, setAutoPickPrompt] = useState<AutoPickPrompt | null>(null);
  const [autoPickError, setAutoPickError] = useState<string | null>(null);
  const [playerPosition, setPlayerPosition] = useState<LocalPoint>({ x: 0, y: 0 });
  const [heading, setHeading] = useState(0);
  const [pin, setPin] = useState<GeoPoint | null>(null);
  const [pinMetrics, setPinMetrics] = useState<{ distance: number; bearing: number } | null>(null);
  const [hazardInfo, setHazardInfo] = useState<{ id: string; type: string; dist_m: number; bearing: number } | null>(null);
  const [plannerExpanded, setPlannerExpanded] = useState(false);
  const [plannerInputs, setPlannerInputs] = useState({
    temperatureC: 20,
    altitude_m: 0,
    wind_mps: 0,
    wind_from_deg: 0,
    slope_dh_m: 0,
  });
  const [plannerResult, setPlannerResult] = useState<PlanOut | null>(null);
  const [shotSession, setShotSession] = useState<ShotSessionState | null>(null);
  const [markLandingArmed, setMarkLandingArmed] = useState(false);
  const [qaBag, setQaBag] = useState<Bag>(() => effectiveBag());
  const [userBagActive, setUserBagActive] = useState<Bag | null>(null);
  const [userBagLoaded, setUserBagLoaded] = useState(false);
  const [bagCalibExpanded, setBagCalibExpanded] = useState(false);
  const [calibrationResult, setCalibrationResult] = useState<CalibOut | null>(null);
  const [calibrationLoading, setCalibrationLoading] = useState(false);
  const [calibrationMessage, setCalibrationMessage] = useState<string | null>(null);
  const selectedCourse = useMemo(
    () => courses.find((c) => c.courseId === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );
  const overlayData = useMemo(() => buildOverlayData(bundle, selectedCourse), [bundle, selectedCourse]);
  const overlayOrigin = useMemo(
    () => (bundle ? deriveOrigin(bundle, selectedCourse) : null),
    [bundle, selectedCourse],
  );
  const playerLatLon = useMemo(
    () => (overlayOrigin ? fromLocalPoint(overlayOrigin, playerPosition) : null),
    [overlayOrigin, playerPosition],
  );
  const camera = useMemo(() => createCameraStub({ fps: 15 }), []);
  const defaultQaBag = useMemo(() => defaultBag(), []);
  const formatDelta = useCallback((value: number) => (value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1)), []);
  const wrapDegrees = useCallback((value: number) => {
    const mod = value % 360;
    return mod < 0 ? mod + 360 : mod;
  }, []);
  const adjustPlannerValue = useCallback(
    (key: PlannerInputKey, delta: number) => {
      setPlannerInputs((prev) => {
        const current = prev[key];
        let next = current + delta;
        switch (key) {
          case 'temperatureC':
            next = Math.min(45, Math.max(-20, next));
            next = Math.round(next);
            break;
          case 'altitude_m':
            next = Math.min(3000, Math.max(-200, next));
            next = Math.round(next);
            break;
          case 'wind_mps':
            next = Math.min(25, Math.max(0, next));
            next = Math.round(next * 10) / 10;
            break;
          case 'wind_from_deg':
            next = wrapDegrees(Math.round(next));
            break;
          case 'slope_dh_m':
            next = Math.min(50, Math.max(-50, next));
            next = Math.round(next * 10) / 10;
            break;
          default:
            break;
        }
        return { ...prev, [key]: next };
      });
      setPlannerResult(null);
      setShotSession(null);
      setMarkLandingArmed(false);
    },
    [setPlannerInputs, setPlannerResult, setShotSession, setMarkLandingArmed, wrapDegrees],
  );
  const handleAutoPickToggle = useCallback(
    (value: boolean) => {
      if (value) {
        if (!autoPickAvailable) {
          return;
        }
        setAutoPickError(null);
        setAutoPickCandidate(null);
        autoCourseRef.current?.reset();
        setAutoPickEnabled(true);
      } else {
        setAutoPickEnabled(false);
        setAutoPickCandidate(null);
        setAutoPickPrompt(null);
        setAutoPickError(null);
        autoCourseRef.current?.reset();
      }
    },
    [autoPickAvailable, autoCourseRef],
  );
  const handleAutoPickDismiss = useCallback(() => {
    autoCourseRef.current?.recordDismiss();
    setAutoPickPrompt(null);
  }, [autoCourseRef]);
  const handleAutoPickSwitch = useCallback(() => {
    const candidate = autoPickPrompt?.candidate;
    if (!candidate) {
      return;
    }
    autoCourseRef.current?.recordSwitch(candidate.courseId, candidate.dist_m);
    setAutoPickPrompt(null);
    setSelectedCourseId(candidate.courseId);
  }, [autoPickPrompt, autoCourseRef]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bag = await getUserBag();
        if (cancelled) {
          return;
        }
        setUserBagActive(bag);
        setQaBag(effectiveBag());
      } catch (error) {
        if (cancelled) {
          return;
        }
        setUserBagActive(null);
        setQaBag(effectiveBag());
      } finally {
        if (!cancelled) {
          setUserBagLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const handleComputePlan = useCallback(() => {
    if (!pinMetrics || pinMetrics.distance <= 0) {
      setPlannerResult(null);
      return;
    }
    const result = computePlaysLike({
      baseDistance_m: pinMetrics.distance,
      temperatureC: plannerInputs.temperatureC,
      altitude_m: plannerInputs.altitude_m,
      wind_mps: plannerInputs.wind_mps,
      wind_from_deg: plannerInputs.wind_from_deg,
      target_azimuth_deg: pinMetrics.bearing,
      slope_dh_m: plannerInputs.slope_dh_m,
    });
    setPlannerResult(result);
    setShotSession(null);
    setMarkLandingArmed(false);
  }, [pinMetrics, plannerInputs, setPlannerResult, setShotSession, setMarkLandingArmed]);
  const handleCalibrateFromSession = useCallback(() => {
    if (calibrationLoading) {
      return;
    }
    setCalibrationLoading(true);
    setCalibrationMessage(null);
    (async () => {
      try {
        const records = await loadHudRunShots();
        const shots: CalibrateShot[] = [];
        for (const record of records) {
          if (!record) {
            continue;
          }
          const club = typeof record.club === 'string' ? record.club.trim() : '';
          const carry = typeof record.carry_m === 'number' ? record.carry_m : null;
          if (!club || carry === null || !Number.isFinite(carry) || carry <= 0) {
            continue;
          }
          const shot: CalibrateShot = { club, carry_m: carry };
          if (record.notes && typeof record.notes === 'string') {
            shot.notes = record.notes;
          }
          shots.push(shot);
        }
        const result = calibrate(shots);
        setCalibrationResult(result);
        if (!shots.length) {
          setCalibrationMessage('No valid shots found in hud_run.json.');
        } else if (!result.usedShots) {
          setCalibrationMessage('Need at least 5 shots per club to compute carries.');
        } else {
          setCalibrationMessage(`Calibrated from ${result.usedShots} shots.`);
        }
      } catch (error) {
        setCalibrationResult(null);
        setCalibrationMessage('Failed to load hud_run.json.');
      } finally {
        setCalibrationLoading(false);
      }
    })();
  }, [calibrationLoading]);
  const handleSavePersonalBag = useCallback(() => {
    if (!calibrationResult || !calibrationResult.usedShots) {
      return;
    }
    const nextBag: Bag = { ...defaultQaBag };
    for (const club of CLUB_SEQUENCE) {
      nextBag[club] = qaBag[club] ?? nextBag[club];
    }
    for (const [club, value] of Object.entries(calibrationResult.suggested)) {
      if (!(CLUB_SEQUENCE as readonly string[]).includes(club)) {
        continue;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        continue;
      }
      nextBag[club as ClubId] = Math.round(numeric);
    }
    setCalibrationMessage('Saving bag…');
    (async () => {
      try {
        await saveUserBag(nextBag);
        const updated = effectiveBag();
        setQaBag(updated);
        setUserBagActive(updated);
        setCalibrationMessage('Personal bag saved for QA.');
      } catch (error) {
        setCalibrationMessage('Failed to persist personal bag.');
      }
    })();
  }, [calibrationResult, defaultQaBag, qaBag]);
  const handleHit = useCallback(() => {
    if (!plannerResult || !pinMetrics) {
      return;
    }
    const now = Date.now();
    shotIdCounterRef.current += 1;
    const shotId = `shot-${now}-${shotIdCounterRef.current}`;
    const suggested =
      typeof plannerResult.clubSuggested === 'string' ? plannerResult.clubSuggested : null;
    const normalizedClub =
      suggested && (CLUB_SEQUENCE as readonly string[]).includes(suggested)
        ? suggested
        : suggestClub(qaBag, plannerResult.playsLike_m);
    setShotSession({
      shotId,
      startedAt: now,
      headingDeg: heading,
      baseDistance: pinMetrics.distance,
      origin: { ...playerPosition },
      plan: plannerResult,
      club: normalizedClub,
      pin: pinRef.current ? { ...pinRef.current } : null,
      landing: undefined,
      completedAt: undefined,
      logged: false,
    });
    setMarkLandingArmed(true);
  }, [heading, pinMetrics, plannerResult, playerPosition, qaBag]);
  const handleArmLanding = useCallback(() => {
    setShotSession((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, landing: undefined, completedAt: undefined, logged: false };
    });
    setMarkLandingArmed(true);
  }, [setMarkLandingArmed, setShotSession]);
  const handleLandingSelected = useCallback(
    (point: LocalPoint) => {
      setShotSession((prev) => {
        if (!prev) {
          return prev;
        }
        return { ...prev, landing: point, completedAt: Date.now(), logged: false };
      });
      setMarkLandingArmed(false);
    },
    [setShotSession, setMarkLandingArmed],
  );
  const createShotPayload = useCallback(
    (session: ShotSessionState): ShotLogRecord | null => {
      if (!session.landing) {
        return null;
      }
      const breakdown = session.plan.breakdown ?? {
        temp_m: 0,
        alt_m: 0,
        head_m: 0,
        slope_m: 0,
      };
      const landGeo = overlayOrigin ? fromLocalPoint(overlayOrigin, session.landing) : null;
      const carry = Math.hypot(
        session.landing.x - session.origin.x,
        session.landing.y - session.origin.y,
      );
      return {
        tStart: session.startedAt,
        tEnd: session.completedAt ?? Date.now(),
        shotId: session.shotId,
        club: session.club ?? null,
        base_m: finiteOrNull(session.baseDistance),
        playsLike_m: finiteOrNull(session.plan.playsLike_m),
        deltas: {
          temp: finiteOrNull(breakdown.temp_m),
          alt: finiteOrNull(breakdown.alt_m),
          head: finiteOrNull(breakdown.head_m),
          slope: finiteOrNull(breakdown.slope_m),
        },
        pin: session.pin ? { lat: session.pin.lat, lon: session.pin.lon } : null,
        land: landGeo ? { lat: landGeo.lat, lon: landGeo.lon } : null,
        carry_m: finiteOrNull(carry),
        heading_deg: finiteOrNull(session.headingDeg),
      };
    },
    [overlayOrigin],
  );
  useEffect(() => {
    if (!shotSession || !shotSession.landing || shotSession.logged) {
      return;
    }
    const payload = createShotPayload(shotSession);
    if (!payload) {
      return;
    }
    emitTelemetry('hud.shot', payload);
    void appendHudRunShot(payload);
    const activeRound = getActiveRoundState();
    if (activeRound && !activeRound.finished && activeRound.holes.length) {
      const index = Math.min(Math.max(activeRound.currentHole, 0), activeRound.holes.length - 1);
      const hole = activeRound.holes[index];
      const roundShot = mapHudRecordToRoundShot(payload);
      if (hole && roundShot) {
        addRoundShot(hole.holeNo, roundShot);
      }
    }
    setShotSession((prev) => {
      if (!prev || prev.shotId !== shotSession.shotId) {
        return prev;
      }
      return { ...prev, logged: true };
    });
  }, [createShotPayload, emitTelemetry, shotSession]);
  const shotSummary = useMemo(() => {
    if (!shotSession || !shotSession.landing) {
      return null;
    }
    const dx = shotSession.landing.x - shotSession.origin.x;
    const dy = shotSession.landing.y - shotSession.origin.y;
    const actual = Math.hypot(dx, dy);
    const planned = shotSession.plan.playsLike_m;
    const error = actual - planned;
    const isClubId = (value: string | null | undefined): value is ClubId =>
      Boolean(value && (CLUB_SEQUENCE as readonly string[]).includes(value));
    const storedClub = shotSession.club;
    const plannedClub = storedClub && isClubId(storedClub)
      ? storedClub
      : isClubId(shotSession.plan.clubSuggested)
        ? shotSession.plan.clubSuggested
        : suggestClub(qaBag, planned);
    const actualClub = suggestClub(qaBag, actual);
    const plannedIdx = CLUB_SEQUENCE.indexOf(plannedClub);
    const actualIdx = CLUB_SEQUENCE.indexOf(actualClub);
    let feedback: string | null = null;
    if (plannedIdx !== -1 && actualIdx !== -1) {
      const diff = actualIdx - plannedIdx;
      if (diff > 0) {
        feedback = `${diff} club${diff === 1 ? '' : 's'} long`;
      } else if (diff < 0) {
        const magnitude = Math.abs(diff);
        feedback = `${magnitude} club${magnitude === 1 ? '' : 's'} short`;
      }
    }
    return { actual, planned, error, feedback, plannedClub, actualClub };
  }, [qaBag, shotSession]);
  const plannerControls = useMemo(
    () => [
      { key: 'temperatureC' as const, label: 'Temp', unit: '°C', step: 1 },
      { key: 'altitude_m' as const, label: 'Altitude', unit: 'm ASL', step: 50 },
      { key: 'wind_mps' as const, label: 'Wind', unit: 'm/s', step: 1 },
      { key: 'wind_from_deg' as const, label: 'From', unit: '°', step: 15 },
      { key: 'slope_dh_m' as const, label: 'Slope Δh', unit: 'm', step: 1 },
    ],
    [],
  );
  const [cameraStats, setCameraStats] = useState<CameraStats>({ latency: 0, fps: 0 });
  const telemetryRef = useRef<TelemetryEmitter | null>(resolveTelemetryEmitter());
  const shotIdCounterRef = useRef(0);
  const bundleRef = useRef<CourseBundle | null>(bundle);
  const playerGeoRef = useRef<GeoPoint | null>(playerLatLon);
  const pinRef = useRef<GeoPoint | null>(pin);

  useEffect(() => {
    telemetryRef.current = resolveTelemetryEmitter();
  }, [qaEnabled]);

  useEffect(() => {
    bundleRef.current = bundle;
  }, [bundle]);

  useEffect(() => {
    playerGeoRef.current = playerLatLon;
  }, [playerLatLon]);

  useEffect(() => {
    pinRef.current = pin;
  }, [pin]);

  const emitTelemetry = useCallback(
    (event: string, data: Record<string, unknown>) => {
      if (!qaEnabled) {
        return;
      }
      const emitter = telemetryRef.current;
      if (emitter) {
        emitter(event, data);
      } else if (typeof console !== 'undefined' && typeof console.log === 'function') {
        console.log(`[qa-arhud] ${event}`, data);
      }
    },
    [qaEnabled],
  );

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
    if (!qaEnabled) {
      if (autoPickEnabled) {
        setAutoPickEnabled(false);
      }
      setAutoPickPrompt(null);
      setAutoPickCandidate(null);
      setAutoPickError(null);
      autoCourseRef.current?.reset();
    }
  }, [qaEnabled, autoPickEnabled, autoCourseRef]);

  useEffect(() => {
    autoCourseRef.current?.reset();
    setAutoPickCandidate(null);
    setAutoPickPrompt(null);
  }, [courses, autoCourseRef]);

  useEffect(() => {
    if (!qaEnabled || !autoPickEnabled || !courses.length) {
      return;
    }
    let cancelled = false;
    const controller = autoCourseRef.current;
    if (!controller) {
      return;
    }
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const poll = async (): Promise<void> => {
      if (cancelled) {
        return;
      }
      try {
        const fix = await getLocation();
        if (cancelled) {
          return;
        }
        setAutoPickAvailable(true);
        setAutoPickError(null);
        const decision = controller.consider(courses, fix, selectedCourseId);
        setAutoPickCandidate(decision.candidate);
        if (!decision.candidate) {
          setAutoPickPrompt(null);
        } else if (decision.shouldPrompt) {
          setAutoPickPrompt((prev) => {
            if (prev && prev.candidate.courseId === decision.candidate?.courseId) {
              return prev;
            }
            return { candidate: decision.candidate, shownAt: Date.now() };
          });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof LocationError && error.code === 'permission-denied') {
          setAutoPickAvailable(false);
          setAutoPickEnabled(false);
          setAutoPickError('Location permission denied');
          setAutoPickCandidate(null);
          setAutoPickPrompt(null);
          autoCourseRef.current?.reset();
          return;
        }
        const message = error instanceof Error ? error.message : 'Location unavailable';
        setAutoPickError(message);
      }
      if (cancelled) {
        return;
      }
      const delay = Math.max(controller.getDebounceMs(), 1000);
      timeout = setTimeout(poll, delay);
    };

    poll();

    return () => {
      cancelled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [qaEnabled, autoPickEnabled, courses, selectedCourseId, autoCourseRef]);

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
      const bundleCurrent = bundleRef.current;
      const playerGeo = playerGeoRef.current;
      if (!bundleCurrent || !playerGeo) {
        setHazardInfo((prev) => (prev ? null : prev));
        setPinMetrics((prev) => (prev ? null : prev));
        return;
      }
      const hazard = nearestFeature(playerGeo, bundleCurrent);
      setHazardInfo((prev) => {
        if (!hazard) {
          return prev ? null : prev;
        }
        if (
          prev &&
          prev.id === hazard.id &&
          prev.type === hazard.type &&
          Math.abs(prev.dist_m - hazard.dist_m) < 0.01 &&
          Math.abs(prev.bearing - hazard.bearing) < 0.01
        ) {
          return prev;
        }
        return hazard;
      });
      const pinTarget = pinRef.current;
      if (pinTarget) {
        const local = toLocalENU(playerGeo, pinTarget);
        const distance = Math.hypot(local.x, local.y);
        const bearing = ((Math.atan2(local.x, local.y) * 180) / Math.PI + 360) % 360;
        setPinMetrics((prev) => {
          if (
            prev &&
            Math.abs(prev.distance - distance) < 0.01 &&
            Math.abs(prev.bearing - bearing) < 0.01
          ) {
            return prev;
          }
          return { distance, bearing };
        });
        emitTelemetry('hud.frame', { pinDist: distance });
      } else {
        setPinMetrics((prev) => (prev ? null : prev));
      }
    }, 200);
    return () => {
      clearInterval(interval);
    };
  }, [emitTelemetry, qaEnabled]);

  const hazardCallout = useMemo(() => {
    if (!hazardInfo) {
      return null;
    }
    return {
      distance: hazardInfo.dist_m,
      direction: directionFromBearing(hazardInfo.bearing, heading),
      id: hazardInfo.id,
      type: hazardInfo.type,
      bearing: hazardInfo.bearing,
    };
  }, [hazardInfo, heading]);

  const handleCourseSelect = useCallback(
    (courseId: string) => {
      setSelectedCourseId(courseId);
      setAutoPickPrompt(null);
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

  const handleSetPin = useCallback(() => {
    const current = playerGeoRef.current;
    if (!current) {
      return;
    }
    const payload = { ...current };
    setPin(payload);
    pinRef.current = payload;
    emitTelemetry('hud.pin.set', { lat: current.lat, lon: current.lon });
  }, [emitTelemetry]);

  const handleClearPin = useCallback(() => {
    if (!pinRef.current) {
      return;
    }
    setPin(null);
    pinRef.current = null;
    setPinMetrics(null);
    emitTelemetry('hud.pin.clear', {});
  }, [emitTelemetry]);

  const baseDistance = pinMetrics?.distance ?? 0;
  const baseDistanceText = baseDistance > 0 ? `${baseDistance.toFixed(1)} m` : '—';
  const plannerDisabled = !pinMetrics || pinMetrics.distance <= 0;
  const planClub = useMemo(() => {
    if (!plannerResult) {
      return null;
    }
    const candidate = plannerResult.clubSuggested;
    if (
      typeof candidate === 'string' &&
      (CLUB_SEQUENCE as readonly string[]).includes(candidate)
    ) {
      return candidate;
    }
    return suggestClub(qaBag, plannerResult.playsLike_m);
  }, [plannerResult, qaBag]);
  const calibrationSaveDisabled = !calibrationResult || !calibrationResult.usedShots;
  const personalBagApplied = userBagLoaded && Boolean(userBagActive);
  const autoPickStatusText = !autoPickAvailable
    ? 'Location permission required'
    : autoPickError && autoPickEnabled
      ? autoPickError
      : autoPickCandidate
        ? `${autoPickCandidate.name ?? autoPickCandidate.courseId} (${formatDistanceMeters(autoPickCandidate.dist_m)})`
        : autoPickEnabled
          ? 'Waiting for GPS…'
          : 'Off';
  const autoPickToggleDisabled = !autoPickAvailable || !courses.length || !qaEnabled;
  const autoPickStatusStyle = [
    styles.autoPickStatus,
    !autoPickEnabled ? styles.autoPickStatusMuted : null,
    !autoPickAvailable || (autoPickError && autoPickEnabled) ? styles.autoPickStatusError : null,
  ];

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
      <View style={styles.autoPickCard}>
        <View style={styles.autoPickRow}>
          <View style={styles.autoPickCopy}>
            <Text style={styles.autoPickTitle}>Auto-pick course</Text>
            <Text style={autoPickStatusStyle}>{autoPickStatusText}</Text>
          </View>
          <Switch
            value={autoPickEnabled}
            onValueChange={handleAutoPickToggle}
            disabled={autoPickToggleDisabled}
            thumbColor={autoPickEnabled ? '#2563eb' : '#e2e8f0'}
            trackColor={{ true: '#60a5fa', false: '#334155' }}
          />
        </View>
        {autoPickPrompt ? (
          <View style={styles.autoPickPromptBox}>
            <Text style={styles.autoPickPromptText}>
              {`Switch to ${autoPickPrompt.candidate.name ?? autoPickPrompt.candidate.courseId} (${formatDistanceMeters(autoPickPrompt.candidate.dist_m)} away)?`}
            </Text>
            <View style={styles.autoPickPromptActions}>
              <TouchableOpacity onPress={handleAutoPickSwitch} style={[styles.autoPickButton, styles.autoPickPrimaryButton]}>
                <Text style={styles.autoPickButtonLabel}>Switch</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAutoPickDismiss} style={styles.autoPickButton}>
                <Text style={styles.autoPickButtonLabel}>Not now</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
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
            hazard={hazardCallout ? { distance: hazardCallout.distance, direction: hazardCallout.direction } : null}
            markLandingActive={markLandingArmed}
            landing={shotSession?.landing ?? null}
            onSelectLanding={handleLandingSelected}
          />
        </View>
      </View>
      <View style={styles.statusPanel}>
        <Text style={styles.sectionTitle}>Pin tools</Text>
        <View style={styles.pinControlsRow}>
          <TouchableOpacity
            onPress={handleSetPin}
            disabled={!playerLatLon}
            style={[styles.pinButton, styles.pinButtonPrimary, !playerLatLon ? styles.pinButtonDisabled : null]}
          >
            <Text style={styles.pinButtonText}>Set Pin</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleClearPin}
            disabled={!pin}
            style={[styles.pinButton, !pin ? styles.pinButtonDisabled : null]}
          >
            <Text style={styles.pinButtonText}>Clear Pin</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.calloutRow}>
          <View style={styles.calloutCard}>
            <Text style={styles.calloutLabel}>Pin</Text>
            <Text style={styles.calloutValue}>
              {pinMetrics ? `${pinMetrics.distance.toFixed(1)} m @ ${pinMetrics.bearing.toFixed(0)}°` : '—'}
            </Text>
          </View>
          <View style={styles.calloutCard}>
            <Text style={styles.calloutLabel}>Hazard</Text>
            <Text style={styles.calloutValue}>
              {hazardCallout ? `${hazardCallout.distance.toFixed(1)} m ${hazardCallout.direction}` : '—'}
            </Text>
            {hazardCallout ? (
              <Text style={styles.calloutSubtext}>{hazardCallout.type.toUpperCase()}</Text>
            ) : null}
          </View>
        </View>
        <View style={[styles.plannerContainer, styles.sectionTitleSpacing]}>
          <TouchableOpacity
            onPress={() => setPlannerExpanded((prev) => !prev)}
            style={styles.plannerHeader}
          >
            <Text style={styles.sectionTitle}>Planner</Text>
            <Text style={styles.plannerChevron}>{plannerExpanded ? '▾' : '▸'}</Text>
          </TouchableOpacity>
          {plannerExpanded ? (
            <View style={styles.plannerContent}>
              <Text style={styles.plannerBase}>Base distance: {baseDistanceText}</Text>
              {plannerControls.map((control) => (
                <View key={control.key} style={styles.plannerRow}>
                  <View style={styles.plannerLabelBlock}>
                    <Text style={styles.plannerLabel}>{control.label}</Text>
                    <Text style={styles.plannerUnit}>{control.unit}</Text>
                  </View>
                  <View style={styles.plannerStepper}>
                    <TouchableOpacity
                      onPress={() => adjustPlannerValue(control.key, -control.step)}
                      style={styles.plannerStepButton}
                    >
                      <Text style={styles.plannerStepText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.plannerValue}>
                      {plannerInputs[control.key].toFixed(
                        control.key === 'wind_from_deg' ||
                          control.key === 'altitude_m' ||
                          control.key === 'temperatureC'
                          ? 0
                          : 1,
                      )}
                    </Text>
                    <TouchableOpacity
                      onPress={() => adjustPlannerValue(control.key, control.step)}
                      style={styles.plannerStepButton}
                    >
                      <Text style={styles.plannerStepText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={styles.plannerButtonRow}>
                <TouchableOpacity
                  onPress={handleComputePlan}
                  disabled={plannerDisabled}
                  style={[
                    styles.plannerButton,
                    styles.plannerButtonPrimary,
                    plannerDisabled ? styles.plannerButtonDisabled : null,
                  ]}
                >
                  <Text style={styles.plannerButtonText}>Compute</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleHit}
                  disabled={!plannerResult}
                  style={[styles.plannerButton, !plannerResult ? styles.plannerButtonDisabled : null]}
                >
                  <Text style={styles.plannerButtonText}>Hit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleArmLanding}
                  disabled={!shotSession}
                  style={[
                    styles.plannerButton,
                    markLandingArmed ? styles.plannerButtonActive : null,
                    !shotSession ? styles.plannerButtonDisabled : null,
                  ]}
                >
                  <Text style={styles.plannerButtonText}>
                    {markLandingArmed ? 'Tap map…' : 'Mark landing'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.plannerResultBlock}>
                <Text style={styles.plannerResultText}>
                  Plays-Like: {plannerResult ? `${plannerResult.playsLike_m.toFixed(1)} m` : '—'}
                </Text>
                {plannerResult ? (
                  <>
                    <Text style={styles.plannerBreakdown}>
                      Δtemp {formatDelta(plannerResult.breakdown.temp_m)} / Δalt{' '}
                      {formatDelta(plannerResult.breakdown.alt_m)} / head{' '}
                      {formatDelta(plannerResult.breakdown.head_m)} / slope{' '}
                      {formatDelta(plannerResult.breakdown.slope_m)}
                    </Text>
                    {planClub ? (
                      <Text style={styles.plannerClub}>Suggested club: {planClub}</Text>
                    ) : null}
                  </>
                ) : null}
              </View>
              {shotSummary ? (
                <View style={styles.resultCard}>
                  <Text style={styles.resultCardTitle}>Result</Text>
                  <Text style={styles.resultCardLine}>
                    Planned: {shotSummary.planned.toFixed(1)} m ({shotSummary.plannedClub})
                  </Text>
                  <Text style={styles.resultCardLine}>
                    Actual carry: {shotSummary.actual.toFixed(1)} m ({shotSummary.actualClub})
                  </Text>
                  <Text style={styles.resultCardLine}>Error: {formatDelta(shotSummary.error)}</Text>
                  {shotSummary.feedback ? (
                    <Text style={styles.resultCardFeedback}>{shotSummary.feedback}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={[styles.calibrationContainer, styles.sectionTitleSpacing]}>
          <TouchableOpacity
            onPress={() => setBagCalibExpanded((prev) => !prev)}
            style={styles.calibrationHeader}
          >
            <Text style={styles.sectionTitle}>Calibrate bag</Text>
            <Text style={styles.plannerChevron}>{bagCalibExpanded ? '▾' : '▸'}</Text>
          </TouchableOpacity>
          {bagCalibExpanded ? (
            <View style={styles.calibrationContent}>
              <Text style={styles.calibrationStatus}>
                {personalBagApplied ? 'Personal bag active' : 'Using default bag'}
              </Text>
              <View style={styles.calibrationActions}>
                <TouchableOpacity
                  onPress={handleCalibrateFromSession}
                  disabled={calibrationLoading}
                  style={[
                    styles.calibrationButton,
                    styles.calibrationButtonPrimary,
                    calibrationLoading ? styles.calibrationButtonDisabled : null,
                  ]}
                >
                  <Text style={styles.calibrationButtonText}>
                    {calibrationLoading ? 'Loading…' : 'Use last session'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSavePersonalBag}
                  disabled={calibrationSaveDisabled}
                  style={[
                    styles.calibrationButton,
                    calibrationSaveDisabled ? styles.calibrationButtonDisabled : null,
                  ]}
                >
                  <Text style={styles.calibrationButtonText}>Save as my bag</Text>
                </TouchableOpacity>
              </View>
              {calibrationMessage ? (
                <Text style={styles.calibrationMessage}>{calibrationMessage}</Text>
              ) : null}
              {calibrationLoading ? <ActivityIndicator size="small" color="#60a5fa" /> : null}
              <View style={styles.calibrationTable}>
                <View style={styles.calibrationRowHeader}>
                  <Text style={styles.calibrationHeaderClub}>Club</Text>
                  <Text style={styles.calibrationHeaderValue}>Default</Text>
                  <Text style={styles.calibrationHeaderValue}>Suggested</Text>
                </View>
                {CLUB_SEQUENCE.slice()
                  .reverse()
                  .map((club) => {
                    const baseline = defaultQaBag[club];
                    const suggested = calibrationResult?.suggested?.[club];
                    const perClub = calibrationResult?.perClub?.[club];
                    const delta =
                      typeof suggested === 'number'
                        ? Math.round(suggested - baseline)
                        : null;
                    const arrow =
                      delta === null ? '' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
                    const deltaText =
                      delta === null ? '—' : `${arrow}${Math.abs(delta)} m`;
                    return (
                      <View key={club} style={styles.calibrationRow}>
                        <View style={styles.calibrationClubCell}>
                          <Text style={styles.calibrationClubText}>{club}</Text>
                          {perClub?.n ? (
                            <Text style={styles.calibrationClubSubtext}>
                              {perClub.n} shots
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.calibrationValueText}>{`${baseline.toFixed(0)} m`}</Text>
                        <View style={styles.calibrationSuggestedCell}>
                          <Text style={styles.calibrationValueText}>
                            {typeof suggested === 'number' ? `${suggested.toFixed(0)} m` : '—'}
                          </Text>
                          <Text style={styles.calibrationDeltaText}>{deltaText}</Text>
                        </View>
                      </View>
                    );
                  })}
              </View>
            </View>
          ) : null}
        </View>
        <Text style={[styles.sectionTitle, styles.sectionTitleSpacing]}>Bundle</Text>
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
  autoPickCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  autoPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  autoPickCopy: {
    flex: 1,
    gap: 4,
  },
  autoPickTitle: {
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '600',
  },
  autoPickStatus: {
    color: '#cbd5f5',
    fontSize: 12,
  },
  autoPickStatusMuted: {
    color: '#94a3b8',
  },
  autoPickStatusError: {
    color: '#fca5a5',
  },
  autoPickPromptBox: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  autoPickPromptText: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 18,
  },
  autoPickPromptActions: {
    flexDirection: 'row',
    gap: 8,
  },
  autoPickButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#334155',
  },
  autoPickPrimaryButton: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  autoPickButtonLabel: {
    color: '#f8fafc',
    fontWeight: '600',
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
  pinControlsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pinButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1f2937',
  },
  pinButtonPrimary: {
    backgroundColor: '#2563eb',
  },
  pinButtonDisabled: {
    opacity: 0.4,
  },
  pinButtonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  plannerContainer: {
    backgroundColor: '#101827',
    borderRadius: 10,
    padding: 12,
    gap: 12,
  },
  plannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plannerChevron: {
    color: '#94a3b8',
    fontSize: 16,
  },
  plannerContent: {
    gap: 12,
  },
  plannerBase: {
    color: '#cbd5f5',
    fontSize: 13,
  },
  plannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  plannerLabelBlock: {
    flex: 1,
    gap: 2,
  },
  plannerLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  plannerUnit: {
    color: '#94a3b8',
    fontSize: 12,
  },
  plannerStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  plannerStepButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plannerStepText: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
  },
  plannerValue: {
    minWidth: 68,
    textAlign: 'center',
    color: '#f8fafc',
    fontVariant: ['tabular-nums'],
  },
  plannerButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  plannerButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plannerButtonPrimary: {
    backgroundColor: '#2563eb',
  },
  plannerButtonActive: {
    backgroundColor: '#7c3aed',
  },
  plannerButtonDisabled: {
    opacity: 0.5,
  },
  plannerButtonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  plannerResultBlock: {
    gap: 6,
  },
  plannerResultText: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 15,
  },
  plannerBreakdown: {
    color: '#cbd5f5',
    fontSize: 12,
    lineHeight: 18,
  },
  plannerClub: {
    color: '#facc15',
    fontWeight: '600',
  },
  resultCard: {
    backgroundColor: '#0b1120',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    gap: 4,
  },
  resultCardTitle: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 14,
  },
  resultCardLine: {
    color: '#e5e7eb',
    fontSize: 13,
  },
  resultCardFeedback: {
    color: '#f97316',
    fontWeight: '600',
  },
  calloutRow: {
    flexDirection: 'row',
    gap: 8,
  },
  calloutCard: {
    flex: 1,
    backgroundColor: '#0b1120',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    gap: 4,
  },
  calloutLabel: {
    color: '#cbd5f5',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  calloutValue: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 14,
  },
  calloutSubtext: {
    color: '#94a3b8',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  calibrationContainer: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  calibrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calibrationContent: {
    gap: 12,
  },
  calibrationStatus: {
    color: '#94a3b8',
    fontSize: 12,
  },
  calibrationActions: {
    flexDirection: 'row',
    gap: 8,
  },
  calibrationButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    alignItems: 'center',
  },
  calibrationButtonPrimary: {
    backgroundColor: '#1d4ed8',
  },
  calibrationButtonDisabled: {
    opacity: 0.5,
  },
  calibrationButtonText: {
    color: '#f8fafc',
    fontWeight: '500',
  },
  calibrationMessage: {
    color: '#f8fafc',
    fontSize: 12,
  },
  calibrationTable: {
    gap: 6,
  },
  calibrationRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 4,
    borderBottomColor: '#1f2937',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  calibrationHeaderClub: {
    flex: 1,
    color: '#cbd5f5',
    fontSize: 12,
    fontWeight: '500',
  },
  calibrationHeaderValue: {
    flex: 1,
    color: '#cbd5f5',
    fontSize: 12,
    textAlign: 'right',
    fontWeight: '500',
  },
  calibrationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomColor: '#1f2937',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  calibrationClubCell: {
    flex: 1,
    gap: 2,
  },
  calibrationClubText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  calibrationClubSubtext: {
    color: '#94a3b8',
    fontSize: 11,
  },
  calibrationValueText: {
    flex: 1,
    color: '#e2e8f0',
    textAlign: 'right',
  },
  calibrationSuggestedCell: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  calibrationDeltaText: {
    color: '#facc15',
    fontSize: 11,
  },
  sectionTitleSpacing: {
    marginTop: 12,
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
  markLandingBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: '#7c3aed',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  markLandingText: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 10,
    letterSpacing: 0.5,
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

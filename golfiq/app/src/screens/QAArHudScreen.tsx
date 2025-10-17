import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { API_BASE } from '../lib/api';

import {
  FPS_MIN,
  HEADING_RMS_MAX_DEG,
  HUD_LATENCY_MAX_MS,
  RECENTER_MAX_S,
} from '../../../../shared/arhud/constants';
import { createHeadingSmoother } from '../../../../shared/arhud/heading_smoother';
import {
  createFrameBudgetTracker,
  now as clockNow,
} from '../../../../shared/arhud/native/clock';
import { createCameraStub } from '../../../../shared/arhud/native/camera_stub';
import { subscribeHeading } from '../../../../shared/arhud/native/heading';
import {
  ArhudState,
  createArhudStateMachine,
} from '../../../../shared/arhud/state_machine';
import {
  createBundleClient,
  type Bundle,
  type BundleFetchInfo,
  type CourseIndexEntry,
} from '../../../../shared/arhud/bundle_client';
import {
  distancePointToLineString,
  distancePointToPolygonEdge,
  toLocalENU,
  type LatLon,
  type LineString,
  type Polygon,
  type Vec2,
} from '../../../../shared/arhud/geo';
import { qaHudEnabled } from '../../../../shared/arhud/native/qa_gate';
import {
  maybeEnforceEdgeDefaultsInRuntime,
  type EdgeDefaults,
} from '../../../../shared/edge/defaults';
import {
  inRollout,
  readEdgeRolloutConfig,
  type EdgeRolloutTelemetry,
  type RcRecord,
} from '../../../../shared/edge/rollout';

const BADGE_COLORS = {
  ok: '#14532d',
  warn: '#7f1d1d',
  neutral: '#1f2937',
} as const;

const FEATURE_STYLES: Record<
  string,
  { fill?: string; stroke: string; opacity?: number; strokeWidth?: number }
> = {
  green: { fill: '#14532d', stroke: '#166534', opacity: 0.28 },
  fairway: { fill: '#0f766e', stroke: '#115e59', opacity: 0.22 },
  bunker: { fill: '#facc15', stroke: '#d97706', opacity: 0.32 },
  hazard: { fill: '#f87171', stroke: '#dc2626', opacity: 0.28 },
  cartpath: { stroke: '#94a3b8', strokeWidth: 2 },
  water: { fill: '#38bdf8', stroke: '#0ea5e9', opacity: 0.28 },
};

const HAZARD_TYPES = new Set(['bunker', 'hazard', 'water']);
const OVERLAY_SIZE = 320;
const OVERLAY_PADDING = 24;
const SELECTION_FILENAME = 'bundles/selection.json';

type ProjectedPolygonFeature = {
  id: string;
  type: string;
  polygons: Polygon[];
};

type ProjectedLineFeature = {
  id: string;
  type: string;
  line: LineString;
};

type HazardShape =
  | { type: 'polygon'; geometry: Polygon }
  | { type: 'line'; geometry: LineString };

type OverlayModel = {
  origin: LatLon;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  polygons: ProjectedPolygonFeature[];
  lines: ProjectedLineFeature[];
  hazards: HazardShape[];
};

type BadgeStatus = keyof typeof BADGE_COLORS;

type DeviceInfo = {
  device: string;
  os: string;
  appVersion: string;
};

const INITIAL_DEVICE_INFO: DeviceInfo = {
  device: 'unknown',
  os: 'unknown',
  appVersion: 'dev',
};

type HudTelemetryEvent = {
  timestampMs: number;
  event: string;
  data: Record<string, unknown>;
};

type GlobalWithRc = typeof globalThis & { RC?: RcRecord };

function getGlobalRc(): RcRecord {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }
  const holder = globalThis as GlobalWithRc;
  return holder.RC;
}

function readRcBoolean(rc: RcRecord, key: string): boolean {
  if (!rc || typeof rc !== 'object') {
    return false;
  }
  const value = (rc as Record<string, unknown>)[key];
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const token = value.trim().toLowerCase();
    return token === '1' || token === 'true' || token === 'yes' || token === 'on';
  }
  return false;
}

async function resolveDeviceId(): Promise<string> {
  try {
    const Application = (await import('expo-application')) as Record<string, unknown> & {
      androidId?: string | null;
      getIosIdForVendorAsync?: () => Promise<string | null | undefined>;
    };
    if (Application && typeof Application === 'object') {
      const androidId = typeof Application.androidId === 'string' ? Application.androidId.trim() : '';
      if (androidId) {
        return `android-${androidId}`;
      }
      if (typeof Application.getIosIdForVendorAsync === 'function') {
        const iosId = await Application.getIosIdForVendorAsync();
        if (iosId && typeof iosId === 'string' && iosId.trim()) {
          return `ios-${iosId.trim()}`;
        }
      }
    }
  } catch (error) {
    // ignore missing module or runtime errors
  }
  try {
    const { default: Constants } = (await import('expo-constants')) as Record<string, unknown> & {
      installationId?: string | null;
      deviceId?: string | null;
    };
    if (Constants && typeof Constants === 'object') {
      const installationId = typeof Constants.installationId === 'string'
        ? Constants.installationId.trim()
        : '';
      if (installationId) {
        return installationId;
      }
      const deviceId = typeof Constants.deviceId === 'string' ? Constants.deviceId.trim() : '';
      if (deviceId) {
        return deviceId;
      }
    }
  } catch (error) {
    // ignore
  }
  return 'unknown-device';
}

const QAArHudScreen: React.FC = () => {
  const machineRef = useRef(createArhudStateMachine());
  const smootherRef = useRef(createHeadingSmoother());
  const frameBudgetRef = useRef(createFrameBudgetTracker());
  const camera = useMemo(() => createCameraStub(), []);

  const [hudState, setHudState] = useState<ArhudState>(
    machineRef.current.current(),
  );
  const stateRef = useRef(hudState);
  useEffect(() => {
    stateRef.current = hudState;
  }, [hudState]);

  const [fps, setFps] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);
  const [headingRaw, setHeadingRaw] = useState(0);
  const [headingSmoothed, setHeadingSmoothed] = useState(0);
  const [headingRms, setHeadingRms] = useState(0);
  const [captureActive, setCaptureActive] = useState(false);
  const [recenterBusy, setRecenterBusy] = useState(false);
  const [lastRecenterMs, setLastRecenterMs] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(INITIAL_DEVICE_INFO);
  const [rolloutTelemetry, setRolloutTelemetry] = useState<EdgeRolloutTelemetry>({
    enforced: false,
    percent: 0,
    kill: false,
  });

  const qaEnabled = qaHudEnabled();
  const fetchInfoRef = useRef<(info: BundleFetchInfo) => void>(() => undefined);
  const bundleClientRef = useRef(
    createBundleClient({
      baseUrl: API_BASE,
      onFetch: (info) => fetchInfoRef.current(info),
    }),
  );
  const [courses, setCourses] = useState<CourseIndexEntry[]>([]);
  const [indexLoading, setIndexLoading] = useState(false);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [bundleMeta, setBundleMeta] = useState<BundleFetchInfo | null>(null);
  const [indexMeta, setIndexMeta] = useState<BundleFetchInfo | null>(null);
  const [offline, setOffline] = useState(false);
  const [overlayZoom, setOverlayZoom] = useState(1);
  const [nearestHazard, setNearestHazard] = useState<number | null>(null);
  const [pickerExpanded, setPickerExpanded] = useState(false);
  const [userLocation, setUserLocation] = useState<LatLon | null>(null);
  const lastSelectionRef = useRef<string | null>(null);
  const selectionPathRef = useRef<string | null>(null);
  const userLocationRef = useRef<LatLon | null>(null);

  const headingRawRef = useRef(0);
  const headingSmoothedRef = useRef(0);
  const headingRmsRef = useRef(0);

  const sessionRef = useRef<string | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const fpsSamplesRef = useRef<number[]>([]);
  const latencySamplesRef = useRef<number[]>([]);
  const rmsSamplesRef = useRef<number[]>([]);
  const recenterSamplesRef = useRef<number[]>([]);
  const hudRunRef = useRef<HudTelemetryEvent[]>([]);
  const hudRunPathRef = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchInfoRef.current = (info: BundleFetchInfo) => {
      if (info.id === 'index') {
        setIndexMeta(info);
        if (info.error) {
          pushLog(`bundle index fallback: ${info.error}`);
        }
        return;
      }
      if (!selectedCourseId || info.id !== selectedCourseId) {
        return;
      }
      setBundleMeta(info);
      if (info.error) {
        setOffline(true);
        pushLog(`bundle fetch ${info.id} failed: ${info.error}`);
        return;
      }
      if (!info.fromCache) {
        setOffline(false);
      }
    };
  }, [pushLog, selectedCourseId]);

  const pushLog = useCallback((entry: string) => {
    setLogs((prev) => {
      const next = [entry, ...prev];
      return next.slice(0, 5);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const Device = await import('expo-device');
        const { default: Constants } = await import('expo-constants');
        const deviceName = Device?.modelName ?? 'unknown';
        const osName = Device?.osName ?? 'unknown';
        const osVersion = Device?.osVersion ?? '';
        const os = [osName, osVersion].filter(Boolean).join(' ').trim() || 'unknown';
        const appVersion =
          Constants?.expoConfig?.version ??
          Constants?.expoConfig?.runtimeVersion ??
          Constants?.manifest?.version ??
          'dev';
        if (!cancelled) {
          setDeviceInfo({
            device: deviceName || 'unknown',
            os,
            appVersion: appVersion ?? 'dev',
          });
        }
      } catch (error) {
        if (!cancelled) {
          setDeviceInfo(INITIAL_DEVICE_INFO);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!qaEnabled) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const FileSystem = await import('expo-file-system');
        const base = FileSystem.documentDirectory;
        if (!base) {
          return;
        }
        const normalizedBase = base.replace(/\/+$/, '');
        const path = `${normalizedBase}/${SELECTION_FILENAME}`;
        selectionPathRef.current = path;
        if (!FileSystem.getInfoAsync || !FileSystem.readAsStringAsync) {
          return;
        }
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists || info.isDirectory) {
          return;
        }
        const raw = await FileSystem.readAsStringAsync(path);
        const parsed = JSON.parse(raw) as { courseId?: string | null } | null;
        if (!cancelled && parsed?.courseId) {
          lastSelectionRef.current = parsed.courseId;
          setSelectedCourseId((prev) => prev ?? parsed.courseId ?? null);
        }
      } catch (error) {
        pushLog(
          `selection load failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qaEnabled, pushLog]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rc = getGlobalRc();
      const rolloutConfig = readEdgeRolloutConfig(rc);
      const rcEnforceLegacy = readRcBoolean(rc, 'edge.defaults.enforce');
      let deviceId = 'unknown-device';
      try {
        deviceId = await resolveDeviceId();
      } catch (error) {
        if (!cancelled) {
          pushLog(
            `device id unavailable: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      const targetPercent = rolloutConfig.percent;
      const inCohort = rolloutConfig.enabled && inRollout(deviceId, targetPercent);
      const enforce = !rolloutConfig.kill && (rcEnforceLegacy || inCohort);
      if (!cancelled) {
        setRolloutTelemetry({
          enforced: enforce,
          percent: targetPercent,
          kill: rolloutConfig.kill,
        });
        pushLog(
          enforce
            ? `edge defaults rollout: enforcing (${targetPercent}% target)`
            : `edge defaults rollout: control (${targetPercent}% target)`,
        );
      }
      try {
        await maybeEnforceEdgeDefaultsInRuntime({
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          rcEnforce: enforce,
          apply: (defaults: EdgeDefaults) => {
            if (cancelled) {
              return;
            }
            pushLog(
              `edge defaults applied: ${defaults.runtime}/${defaults.inputSize}/${defaults.quant}`,
            );
          },
          rollout: {
            deviceId,
            rc,
            onEvaluated: (decision) => {
              if (cancelled) {
                return;
              }
              setRolloutTelemetry({
                enforced: decision.enforced,
                percent: decision.percent,
                kill: decision.kill,
              });
            },
          },
        });
      } catch (error) {
        if (!cancelled) {
          pushLog(
            `edge defaults error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pushLog]);

  const persistHudRun = useCallback(async () => {
    try {
      const FileSystem = await import('expo-file-system');
      const directory = FileSystem.documentDirectory;
      if (!directory) {
        return null;
      }
      const path = directory + 'hud_run.json';
      await FileSystem.writeAsStringAsync(
        path,
        JSON.stringify(hudRunRef.current, null, 2),
      );
      hudRunPathRef.current = path;
      return path;
    } catch (error) {
      pushLog(
        `persist failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }, [pushLog]);

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) {
      return;
    }
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void persistHudRun();
    }, 250);
  }, [persistHudRun]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      camera.stop();
    };
  }, [camera]);

  useEffect(() => {
    if (!qaEnabled || !selectedCourseId) {
      return;
    }
    if (lastSelectionRef.current === selectedCourseId) {
      return;
    }
    lastSelectionRef.current = selectedCourseId;
    (async () => {
      try {
        const FileSystem = await import('expo-file-system');
        const base = FileSystem.documentDirectory;
        if (!base || !FileSystem.writeAsStringAsync) {
          return;
        }
        const normalizedBase = base.replace(/\/+$/, '');
        const path = `${normalizedBase}/${SELECTION_FILENAME}`;
        selectionPathRef.current = path;
        const dir = path.replace(/\/+[^/]*$/, '');
        if (FileSystem.makeDirectoryAsync) {
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
        await FileSystem.writeAsStringAsync(
          path,
          JSON.stringify({ courseId: selectedCourseId, updatedAt: Date.now() }),
        );
      } catch (error) {
        pushLog(
          `selection save failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    })();
  }, [qaEnabled, selectedCourseId, pushLog]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    if (!qaEnabled) {
      return;
    }
    let active = true;
    let subscription: { remove?: () => void } | null = null;
    let watchId: number | null = null;

    (async () => {
      try {
        const Location = (await import('expo-location')) as Record<string, unknown> & {
          requestForegroundPermissionsAsync?: () => Promise<{ status: string }>;
          watchPositionAsync?: (
            options: Record<string, unknown>,
            callback: (event: { coords: { latitude: number; longitude: number } }) => void,
          ) => Promise<{ remove?: () => void }>;
          getCurrentPositionAsync?: (
            options?: Record<string, unknown>,
          ) => Promise<{ coords: { latitude: number; longitude: number } }>;
          Accuracy?: { High?: unknown };
        };
        if (!active) {
          return;
        }
        if (Location.requestForegroundPermissionsAsync) {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (!active || permission.status !== 'granted') {
            return;
          }
        }
        if (Location.watchPositionAsync) {
          subscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy?.High ?? undefined,
              distanceInterval: 1,
            },
            (event) => {
              if (!active) {
                return;
              }
              setUserLocation({
                lat: event.coords.latitude,
                lon: event.coords.longitude,
              });
            },
          );
          return;
        }
        if (Location.getCurrentPositionAsync) {
          const current = await Location.getCurrentPositionAsync();
          if (!active) {
            return;
          }
          setUserLocation({
            lat: current.coords.latitude,
            lon: current.coords.longitude,
          });
          return;
        }
      } catch {
        if (typeof navigator !== 'undefined' && navigator?.geolocation?.watchPosition) {
          watchId = navigator.geolocation.watchPosition(
            (position) => {
              if (!active) {
                return;
              }
              setUserLocation({
                lat: position.coords.latitude,
                lon: position.coords.longitude,
              });
            },
            () => undefined,
            { enableHighAccuracy: true, distanceFilter: 1 },
          );
        }
      }
    })();

    return () => {
      active = false;
      if (subscription?.remove) {
        subscription.remove();
      }
      if (watchId !== null && typeof navigator !== 'undefined') {
        navigator.geolocation?.clearWatch?.(watchId);
      }
    };
  }, [qaEnabled]);

  useEffect(() => {
    if (!qaEnabled || !selectedCourseId) {
      return;
    }
    const entry = courses.find((course) => course.courseId === selectedCourseId);
    if (!entry) {
      return;
    }
    if (!userLocationRef.current) {
      const [minLon, minLat, maxLon, maxLat] = entry.bbox;
      const lat = (minLat + maxLat) / 2;
      const lon = (minLon + maxLon) / 2;
      setUserLocation({ lat, lon });
    }
  }, [qaEnabled, courses, selectedCourseId]);

  useEffect(() => {
    if (!qaEnabled) {
      return;
    }
    let cancelled = false;
    setIndexLoading(true);
    bundleClientRef.current
      .getIndex()
      .then((list) => {
        if (cancelled) {
          return;
        }
        setCourses(list);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        pushLog(
          `bundle index error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        setCourses([]);
      })
      .finally(() => {
        if (!cancelled) {
          setIndexLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [qaEnabled, pushLog]);

  useEffect(() => {
    if (!qaEnabled || !courses.length) {
      return;
    }
    if (selectedCourseId && courses.some((course) => course.courseId === selectedCourseId)) {
      return;
    }
    const preferred = lastSelectionRef.current;
    if (preferred && courses.some((course) => course.courseId === preferred)) {
      setSelectedCourseId(preferred);
      return;
    }
    setSelectedCourseId(courses[0]?.courseId ?? null);
  }, [qaEnabled, courses, selectedCourseId]);

  useEffect(() => {
    if (!qaEnabled || !selectedCourseId) {
      setBundle(null);
      return;
    }
    let cancelled = false;
    setBundleLoading(true);
    setOffline(false);
    bundleClientRef.current
      .getBundle(selectedCourseId)
      .then((data) => {
        if (!cancelled) {
          setBundle(data);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBundle(null);
          pushLog(
            `bundle load failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBundleLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [qaEnabled, selectedCourseId, pushLog]);

  const selectedCourse = useMemo(() => {
    if (!selectedCourseId) {
      return null;
    }
    return courses.find((course) => course.courseId === selectedCourseId) ?? null;
  }, [courses, selectedCourseId]);

  const selectedCourseName = useMemo(() => {
    if (selectedCourse) {
      return selectedCourse.name ?? selectedCourse.courseId;
    }
    return selectedCourseId ?? 'Select course';
  }, [selectedCourse, selectedCourseId]);

  const overlayModel = useMemo<OverlayModel | null>(() => {
    if (!bundle) {
      return null;
    }

    const deriveOrigin = (): LatLon | null => {
      if (selectedCourse) {
        const [minLon, minLat, maxLon, maxLat] = selectedCourse.bbox;
        const lat = (minLat + maxLat) / 2;
        const lon = (minLon + maxLon) / 2;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          return { lat, lon };
        }
      }
      for (const feature of bundle.features) {
        const geometry = feature?.geometry;
        if (!geometry) {
          continue;
        }
        if (geometry.type === 'LineString') {
          const line = geometry.coordinates as unknown[];
          for (const coord of line) {
            if (Array.isArray(coord) && coord.length >= 2) {
              const [lon, lat] = coord as [number, number];
              if (Number.isFinite(lat) && Number.isFinite(lon)) {
                return { lat, lon };
              }
            }
          }
        } else if (geometry.type === 'Polygon') {
          const rings = geometry.coordinates as unknown[];
          for (const ring of rings) {
            if (!Array.isArray(ring)) {
              continue;
            }
            for (const coord of ring as unknown[]) {
              if (Array.isArray(coord) && coord.length >= 2) {
                const [lon, lat] = coord as [number, number];
                if (Number.isFinite(lat) && Number.isFinite(lon)) {
                  return { lat, lon };
                }
              }
            }
          }
        } else if (geometry.type === 'MultiPolygon') {
          const polygons = geometry.coordinates as unknown[];
          for (const polygon of polygons) {
            if (!Array.isArray(polygon)) {
              continue;
            }
            for (const ring of polygon as unknown[]) {
              if (!Array.isArray(ring)) {
                continue;
              }
              for (const coord of ring as unknown[]) {
                if (Array.isArray(coord) && coord.length >= 2) {
                  const [lon, lat] = coord as [number, number];
                  if (Number.isFinite(lat) && Number.isFinite(lon)) {
                    return { lat, lon };
                  }
                }
              }
            }
          }
        }
      }
      return null;
    };

    const origin = deriveOrigin();
    if (!origin) {
      return null;
    }

    const polygons: ProjectedPolygonFeature[] = [];
    const lines: ProjectedLineFeature[] = [];
    const hazards: HazardShape[] = [];

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const updateBounds = (point: Vec2) => {
      if (point.x < minX) {
        minX = point.x;
      }
      if (point.x > maxX) {
        maxX = point.x;
      }
      if (point.y < minY) {
        minY = point.y;
      }
      if (point.y > maxY) {
        maxY = point.y;
      }
    };

    const projectPoint = (coord: unknown): Vec2 | null => {
      if (!Array.isArray(coord) || coord.length < 2) {
        return null;
      }
      const [lon, lat] = coord as [number, number];
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }
      const projected = toLocalENU(origin, { lat, lon });
      updateBounds(projected);
      return projected;
    };

    const pushPolygon = (id: string, type: string, groups: Vec2[][][]) => {
      if (!groups.length) {
        return;
      }
      const poly: Polygon[] = groups.map((rings) => rings.map((ring) => [...ring]) as LineString[]) as Polygon[];
      polygons.push({ id, type, polygons: poly });
      if (HAZARD_TYPES.has(type)) {
        for (const rings of poly) {
          hazards.push({ type: 'polygon', geometry: rings });
        }
      }
    };

    const pushLine = (id: string, type: string, points: Vec2[]) => {
      if (!points.length) {
        return;
      }
      const line = points as LineString;
      lines.push({ id, type, line });
      if (HAZARD_TYPES.has(type)) {
        hazards.push({ type: 'line', geometry: line });
      }
    };

    for (const feature of bundle.features) {
      const geometry = feature?.geometry;
      if (!geometry) {
        continue;
      }
      if (geometry.type === 'LineString') {
        const coords = geometry.coordinates as unknown[];
        const points: Vec2[] = [];
        for (const coord of coords) {
          const projected = projectPoint(coord);
          if (projected) {
            points.push(projected);
          }
        }
        pushLine(feature.id, feature.type, points);
      } else if (geometry.type === 'Polygon') {
        const rings = geometry.coordinates as unknown[];
        const projectedGroups: Vec2[][][] = [];
        const projectedRings: Vec2[][] = [];
        for (const ring of rings) {
          if (!Array.isArray(ring)) {
            continue;
          }
          const projectedRing: Vec2[] = [];
          for (const coord of ring as unknown[]) {
            const projected = projectPoint(coord);
            if (projected) {
              projectedRing.push(projected);
            }
          }
          if (projectedRing.length) {
            projectedRings.push(projectedRing);
          }
        }
        if (projectedRings.length) {
          projectedGroups.push(projectedRings);
        }
        pushPolygon(feature.id, feature.type, projectedGroups);
      } else if (geometry.type === 'MultiPolygon') {
        const polygonsRaw = geometry.coordinates as unknown[];
        const groups: Vec2[][][] = [];
        for (const polygon of polygonsRaw) {
          if (!Array.isArray(polygon)) {
            continue;
          }
          const rings: Vec2[][] = [];
          for (const ring of polygon as unknown[]) {
            if (!Array.isArray(ring)) {
              continue;
            }
            const projectedRing: Vec2[] = [];
            for (const coord of ring as unknown[]) {
              const projected = projectPoint(coord);
              if (projected) {
                projectedRing.push(projected);
              }
            }
            if (projectedRing.length) {
              rings.push(projectedRing);
            }
          }
          if (rings.length) {
            groups.push(rings);
          }
        }
        pushPolygon(feature.id, feature.type, groups);
      }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
      minX = -25;
      maxX = 25;
      minY = -25;
      maxY = 25;
    }

    return {
      origin,
      bounds: { minX, maxX, minY, maxY },
      polygons,
      lines,
      hazards,
    };
  }, [bundle, selectedCourse]);

  const userLocal = useMemo<Vec2 | null>(() => {
    if (!overlayModel || !userLocation) {
      return null;
    }
    return toLocalENU(overlayModel.origin, userLocation);
  }, [overlayModel, userLocation]);

  const overlayView = useMemo(() => {
    if (!overlayModel) {
      return null;
    }
    const { bounds, polygons, lines } = overlayModel;
    const spanX = Math.max(bounds.maxX - bounds.minX, 1);
    const spanY = Math.max(bounds.maxY - bounds.minY, 1);
    const available = OVERLAY_SIZE - OVERLAY_PADDING * 2;
    const baseScale = Math.min(available / spanX, available / spanY);
    const scale = baseScale * overlayZoom;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    const project = (point: Vec2) => ({
      x: OVERLAY_SIZE / 2 + (point.x - centerX) * scale,
      y: OVERLAY_SIZE / 2 - (point.y - centerY) * scale,
    });

    const polygonPaths = polygons.map((polygon) => {
      const paths = polygon.polygons.map((rings) => {
        const commands: string[] = [];
        for (const ring of rings) {
          if (!ring.length) {
            continue;
          }
          const projectedRing = ring.map(project);
          const [first, ...rest] = projectedRing;
          commands.push(`M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`);
          for (const point of rest) {
            commands.push(`L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`);
          }
          commands.push('Z');
        }
        return commands.join(' ');
      });
      return { id: polygon.id, type: polygon.type, paths };
    });

    const linePaths = lines.map((line) => {
      if (!line.line.length) {
        return { id: line.id, type: line.type, path: '' };
      }
      const projectedPoints = line.line.map(project);
      const [first, ...rest] = projectedPoints;
      const commands = [`M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`];
      for (const point of rest) {
        commands.push(`L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`);
      }
      return { id: line.id, type: line.type, path: commands.join(' ') };
    });

    const userPoint = userLocal ? project(userLocal) : null;
    const headingRad = ((headingSmoothed % 360) * Math.PI) / 180;
    const arrow = userPoint
      ? {
          x1: userPoint.x,
          y1: userPoint.y,
          x2: userPoint.x + Math.sin(headingRad) * 28,
          y2: userPoint.y - Math.cos(headingRad) * 28,
        }
      : null;

    return { polygonPaths, linePaths, userPoint, arrow };
  }, [overlayModel, overlayZoom, userLocal, headingSmoothed]);

  useEffect(() => {
    if (!overlayModel || !userLocal) {
      setNearestHazard(null);
      return;
    }
    const compute = () => {
      let min = Number.POSITIVE_INFINITY;
      for (const hazard of overlayModel.hazards) {
        const distance =
          hazard.type === 'line'
            ? distancePointToLineString(userLocal, hazard.geometry)
            : distancePointToPolygonEdge(userLocal, hazard.geometry);
        if (distance < min) {
          min = distance;
        }
      }
      setNearestHazard(Number.isFinite(min) ? min : null);
    };
    compute();
    const timer = setInterval(compute, 200);
    return () => {
      clearInterval(timer);
    };
  }, [overlayModel, userLocal]);

  const recordTelemetry = useCallback(
    (event: string, data: Record<string, unknown>) => {
      const record: HudTelemetryEvent = {
        timestampMs: Date.now(),
        event,
        data,
      };
      hudRunRef.current.push(record);
      schedulePersist();
      const sessionId = sessionRef.current;
      void (async () => {
        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          const apiKey =
            process.env.EXPO_PUBLIC_API_KEY ??
            process.env.QA_HUD_API_KEY ??
            process.env.API_KEY;
          if (apiKey) {
            headers['X-API-Key'] = apiKey;
          }
          await fetch(`${API_BASE}/telemetry`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...record,
              sessionId,
            }),
          });
        } catch (error) {
          pushLog(
            `telemetry error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      })();
    },
    [schedulePersist, pushLog],
  );

  const handleFrame = useCallback(
    (frame: { captureTs: number; latencyMs: number }) => {
      const displayTs = clockNow();
      const budget = frameBudgetRef.current.sample(
        frame.captureTs,
        displayTs,
        frame.latencyMs,
      );
      const latency = frame.latencyMs ?? budget.latencyMs;
      setFps(budget.fps);
      setLatencyMs(latency);
      fpsSamplesRef.current.push(budget.fps);
      latencySamplesRef.current.push(latency);
      rmsSamplesRef.current.push(headingRmsRef.current);
      recordTelemetry('hud.frame', {
        t: displayTs,
        fps: budget.fps,
        latencyMs: latency,
        headingRaw: headingRawRef.current,
        headingSmoothed: headingSmoothedRef.current,
        rms: headingRmsRef.current,
        state: stateRef.current,
      });
    },
    [recordTelemetry],
  );

  useEffect(() => {
    const unsubscribe = subscribeHeading((deg) => {
      headingRawRef.current = deg;
      setHeadingRaw(deg);
      const smoothed = smootherRef.current.next(deg);
      headingSmoothedRef.current = smoothed;
      setHeadingSmoothed(smoothed);
      const rms = smootherRef.current.rms();
      headingRmsRef.current = rms;
      setHeadingRms(rms);
    });
    return unsubscribe;
  }, []);

  const startSession = useCallback(async () => {
    if (captureActive) {
      return;
    }
    const sessionId = `hud-${Date.now().toString(36)}`;
    sessionRef.current = sessionId;
    sessionStartRef.current = clockNow();
    fpsSamplesRef.current = [];
    latencySamplesRef.current = [];
    rmsSamplesRef.current = [];
    recenterSamplesRef.current = [];
    hudRunRef.current = [];
    frameBudgetRef.current.reset();
    smootherRef.current.reset();
    machineRef.current.reset();
    const baselineState = machineRef.current.current();
    setHudState(baselineState);
    headingRmsRef.current = 0;
    headingSmoothedRef.current = 0;
    headingRawRef.current = 0;
    await persistHudRun();
    setCaptureActive(true);
    pushLog(`session ${sessionId} started`);
    recordTelemetry('hud.session.start', {
      sessionId,
      device: deviceInfo.device,
      os: deviceInfo.os,
      appVersion: deviceInfo.appVersion,
      rollout: rolloutTelemetry,
    });
    try {
      await camera.start(handleFrame);
    } catch (error) {
      pushLog(
        `camera start failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, [
    camera,
    captureActive,
    deviceInfo.appVersion,
    deviceInfo.device,
    deviceInfo.os,
    handleFrame,
    persistHudRun,
    pushLog,
    recordTelemetry,
    rolloutTelemetry,
  ]);

  const stopSession = useCallback(() => {
    if (!captureActive) {
      return;
    }
    camera.stop();
    setCaptureActive(false);
    const durationMs = sessionStartRef.current
      ? clockNow() - sessionStartRef.current
      : 0;
    const duration = durationMs / 1000;
    const avgFps = average(fpsSamplesRef.current);
    const p95Latency = percentile(latencySamplesRef.current, 0.95);
    const rmsMean = average(rmsSamplesRef.current);
    recordTelemetry('hud.session.end', {
      sessionId: sessionRef.current,
      duration,
      avgFps,
      p95Latency,
      rmsMean,
      recenterSamples: [...recenterSamplesRef.current],
    });
    pushLog('session stopped');
    sessionRef.current = null;
  }, [camera, captureActive, recordTelemetry, pushLog]);

  const toggleCapture = useCallback(() => {
    if (captureActive) {
      stopSession();
    } else {
      void startSession();
    }
  }, [captureActive, startSession, stopSession]);

  const handleRecenter = useCallback(async () => {
    if (!captureActive || recenterBusy) {
      return;
    }
    setRecenterBusy(true);
    const machine = machineRef.current;
    machine.dispatch('recenterRequested');
    const updatedState = machine.current();
    setHudState(updatedState);
    pushLog('recenter requested');
    const started = clockNow();
    let elapsed = 0;
    try {
      elapsed = await camera.requestRecenter();
    } catch (error) {
      pushLog(
        `recenter error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      if (!elapsed) {
        elapsed = clockNow() - started;
      }
    }
    machine.dispatch('recentered');
    const nextState = machine.current();
    setHudState(nextState);
    smootherRef.current.reset();
    recenterSamplesRef.current.push(elapsed);
    setLastRecenterMs(elapsed);
    recordTelemetry('hud.recenter', {
      t: clockNow(),
      elapsedSinceRequest: elapsed,
      state: nextState,
    });
    pushLog(`recenter complete (${(elapsed / 1000).toFixed(2)}s)`);
    setRecenterBusy(false);
  }, [
    camera,
    captureActive,
    recenterBusy,
    recordTelemetry,
    pushLog,
  ]);

  const exportRun = useCallback(async () => {
    try {
      const FileSystem = await import('expo-file-system');
      const directory = FileSystem.documentDirectory;
      if (!directory) {
        pushLog('file system unavailable');
        return;
      }
      if (!hudRunRef.current.length) {
        await FileSystem.writeAsStringAsync(directory + 'hud_run.json', '[]');
      }
      const path = hudRunPathRef.current ?? directory + 'hud_run.json';
      const data = await FileSystem.readAsStringAsync(path);
      const runId = (sessionRef.current ?? `hud-${Date.now()}`).replace(
        /[^a-zA-Z0-9-_]/g,
        '',
      );
      const apiKey =
        process.env.EXPO_PUBLIC_API_KEY ??
        process.env.QA_HUD_API_KEY ??
        process.env.API_KEY;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['X-API-Key'] = apiKey;
      }
      const handshake = await fetch(`${API_BASE}/runs/upload-url`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ runId }),
      });
      if (!handshake.ok) {
        pushLog(`export handshake failed (${handshake.status})`);
        return;
      }
      const info = await handshake.json();
      if (info.backend === 's3' && info.url) {
        const s3Headers: Record<string, string> = info.headers ?? {};
        if (!('Content-Type' in s3Headers)) {
          s3Headers['Content-Type'] = 'application/json';
        }
        const upload = await fetch(info.url, {
          method: 'PUT',
          headers: s3Headers,
          body: data,
        });
        if (upload.ok) {
          pushLog('hud_run.json exported via S3');
        } else {
          pushLog(`export upload failed (${upload.status})`);
        }
        return;
      }
      if (info.formUrl && info.key) {
        const result = await FileSystem.uploadAsync(
          `${API_BASE}${info.formUrl}`,
          path,
          {
            fieldName: 'file',
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            parameters: { key: info.key },
            headers: apiKey ? { 'X-API-Key': apiKey } : undefined,
          },
        );
        if (result.status >= 200 && result.status < 300) {
          pushLog('hud_run.json exported');
        } else {
          pushLog(`export upload failed (${result.status})`);
        }
      }
    } catch (error) {
      pushLog(
        `export failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, [pushLog]);

  const fpsStatus: BadgeStatus = fps >= FPS_MIN ? 'ok' : 'warn';
  const latencyStatus: BadgeStatus =
    latencyMs <= HUD_LATENCY_MAX_MS ? 'ok' : 'warn';
  const headingStatus: BadgeStatus =
    headingRms <= HEADING_RMS_MAX_DEG ? 'ok' : 'warn';
  const recenterStatus: BadgeStatus =
    lastRecenterMs === null
      ? 'neutral'
      : lastRecenterMs / 1000 <= RECENTER_MAX_S
      ? 'ok'
      : 'warn';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>QA HUD Telemetry</Text>
      <Text style={styles.subTitle}>
        Device: {deviceInfo.device} • OS: {deviceInfo.os} • App:{' '}
        {deviceInfo.appVersion}
      </Text>
      <View style={styles.metricsRow}>
        <MetricBadge label="State" value={hudState} status="neutral" />
        <MetricBadge
          label="FPS"
          value={`${formatNumber(fps)}`}
          status={fpsStatus}
        />
        <MetricBadge
          label="Latency"
          value={`${formatNumber(latencyMs)} ms`}
          status={latencyStatus}
        />
        <MetricBadge
          label="Heading RMS"
          value={`${formatNumber(headingRms, 2)}°`}
          status={headingStatus}
        />
        <MetricBadge
          label="Re-center"
          value={
            lastRecenterMs === null
              ? '–'
              : `${formatNumber(lastRecenterMs / 1000, 2)} s`
          }
          status={recenterStatus}
        />
      </View>
      <View style={styles.headingBlock}>
        <Text style={styles.headingText}>
          Heading raw: {formatNumber(headingRaw, 1)}°
        </Text>
        <Text style={styles.headingText}>
          Heading smooth: {formatNumber(headingSmoothed, 1)}°
        </Text>
      </View>
      {qaEnabled ? (
        <View style={styles.overlaySection}>
          <View style={styles.overlayHeader}>
            <Text style={styles.sectionTitle}>On-course overlay</Text>
            {offline ? <Text style={styles.offlineBadge}>Offline</Text> : null}
          </View>
          <View style={styles.pickerRow}>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setPickerExpanded((prev) => !prev)}
            >
              <Text style={styles.pickerButtonLabel}>{selectedCourseName}</Text>
              <Text style={styles.pickerButtonHint}>
                {courses.length ? `${courses.length} course(s)` : 'Tap to load courses'}
              </Text>
            </TouchableOpacity>
            {indexLoading ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : null}
          </View>
          {pickerExpanded ? (
            <View style={styles.pickerDropdown}>
              {courses.map((course) => {
                const active = course.courseId === selectedCourseId;
                return (
                  <TouchableOpacity
                    key={course.courseId}
                    style={[styles.pickerItem, active && styles.pickerItemActive]}
                    onPress={() => {
                      setSelectedCourseId(course.courseId);
                      setPickerExpanded(false);
                    }}
                  >
                    <Text style={styles.pickerItemLabel}>
                      {course.name ?? course.courseId}
                    </Text>
                    <Text style={styles.pickerItemMeta}>
                      Updated {new Date(course.updatedAt).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          <View style={styles.overlayCanvasWrapper}>
            {overlayView ? (
              <Svg
                width={OVERLAY_SIZE}
                height={OVERLAY_SIZE}
                style={styles.overlaySvg}
              >
                {overlayView.polygonPaths.map((polygon) => {
                  const style = FEATURE_STYLES[polygon.type] ?? {
                    fill: '#6b7280',
                    stroke: '#4b5563',
                    opacity: 0.18,
                  };
                  return polygon.paths.map((path, index) => (
                    <Path
                      key={`${polygon.id}-${index}`}
                      d={path}
                      fill={style.fill ?? 'none'}
                      fillOpacity={style.opacity ?? (style.fill ? 0.24 : 0)}
                      stroke={style.stroke}
                      strokeWidth={style.strokeWidth ?? 1.4}
                    />
                  ));
                })}
                {overlayView.linePaths.map((line) => {
                  if (!line.path) {
                    return null;
                  }
                  const style = FEATURE_STYLES[line.type] ?? {
                    stroke: '#4b5563',
                    strokeWidth: 1.8,
                  };
                  return (
                    <Path
                      key={line.id}
                      d={line.path}
                      stroke={style.stroke}
                      strokeWidth={style.strokeWidth ?? 1.8}
                      strokeLinecap="round"
                      fill="none"
                    />
                  );
                })}
                {overlayView.userPoint ? (
                  <>
                    <Circle
                      cx={overlayView.userPoint.x}
                      cy={overlayView.userPoint.y}
                      r={7}
                      fill="#1d4ed8"
                      opacity={0.9}
                    />
                    <Circle
                      cx={overlayView.userPoint.x}
                      cy={overlayView.userPoint.y}
                      r={11}
                      stroke="#bfdbfe"
                      strokeWidth={1.2}
                      fill="none"
                      opacity={0.7}
                    />
                  </>
                ) : null}
                {overlayView.arrow ? (
                  <Path
                    d={`M ${overlayView.arrow.x1.toFixed(1)} ${overlayView.arrow.y1.toFixed(1)} L ${overlayView.arrow.x2.toFixed(1)} ${overlayView.arrow.y2.toFixed(1)}`}
                    stroke="#3b82f6"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                  />
                ) : null}
              </Svg>
            ) : (
              <View style={styles.overlayPlaceholder}>
                {bundleLoading ? (
                  <ActivityIndicator color="#e5e7eb" />
                ) : null}
                <Text style={styles.overlayPlaceholderText}>
                  {bundleLoading
                    ? 'Loading bundle…'
                    : 'Pick a course to preview its bundle'}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.zoomRow}>
            <TouchableOpacity
              style={styles.zoomButton}
              onPress={() => setOverlayZoom((value) => Math.max(0.4, Number((value - 0.2).toFixed(1))))}
            >
              <Text style={styles.zoomButtonLabel}>−</Text>
            </TouchableOpacity>
            <Text style={styles.zoomLabel}>{overlayZoom.toFixed(1)}×</Text>
            <TouchableOpacity
              style={styles.zoomButton}
              onPress={() => setOverlayZoom((value) => Math.min(3, Number((value + 0.2).toFixed(1))))}
            >
              <Text style={styles.zoomButtonLabel}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.distanceRow}>
            <View style={styles.distanceCard}>
              <Text style={styles.distanceLabel}>Nearest hazard</Text>
              <Text style={styles.distanceValue}>
                {nearestHazard === null
                  ? '–'
                  : `${formatNumber(Math.max(0, nearestHazard), 1)} m`}
              </Text>
            </View>
            {bundleMeta ? (
              <View style={styles.distanceCard}>
                <Text style={styles.distanceLabel}>Bundle source</Text>
                <Text style={styles.distanceValue}>
                  {bundleMeta.fromCache ? 'Cache' : 'Network'}
                </Text>
                <Text style={styles.distanceMeta}>
                  {bundleMeta.etag ? `ETag ${bundleMeta.etag}` : 'No ETag'}
                </Text>
              </View>
            ) : null}
          </View>
          {indexMeta?.timestamp ? (
            <Text style={styles.overlayFootnote}>
              Index refreshed {new Date(indexMeta.timestamp).toLocaleTimeString()}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.buttonsRow}>
        <TouchableOpacity
          style={[
            styles.button,
            captureActive ? styles.stopButton : styles.startButton,
          ]}
          onPress={toggleCapture}
        >
          <Text style={styles.buttonText}>
            {captureActive ? 'Stop capture' : 'Start capture'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.button,
            styles.secondaryButton,
            (!captureActive || recenterBusy) && styles.disabledButton,
          ]}
          onPress={handleRecenter}
          disabled={!captureActive || recenterBusy}
        >
          <Text style={styles.buttonText}>Re-center</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={exportRun}
        >
          <Text style={styles.buttonText}>Export</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.logContainer}>
        <Text style={styles.logTitle}>Recent events</Text>
        {logs.length === 0 ? (
          <Text style={styles.logEntry}>No events yet.</Text>
        ) : (
          logs.map((entry, index) => (
            <Text key={`${entry}-${index}`} style={styles.logEntry}>
              {entry}
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
};

type MetricBadgeProps = {
  label: string;
  value: string;
  status: BadgeStatus;
};

const MetricBadge: React.FC<MetricBadgeProps> = ({ label, value, status }) => {
  return (
    <View style={[styles.badge, { backgroundColor: BADGE_COLORS[status] }]}>
      <Text style={styles.badgeLabel}>{label}</Text>
      <Text style={styles.badgeValue}>{value}</Text>
    </View>
  );
};

function formatNumber(value: number, fractionDigits = 1): string {
  if (!Number.isFinite(value)) {
    return '0.0';
  }
  return value.toFixed(fractionDigits);
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sum = values.reduce((acc, item) => acc + item, 0);
  return sum / values.length;
}

function percentile(values: number[], p: number): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[index];
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  subTitle: { fontSize: 14, color: '#4b5563' },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badge: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, minWidth: 110 },
  badgeLabel: { color: '#f9fafb', fontSize: 12, textTransform: 'uppercase' },
  badgeValue: { color: '#f9fafb', fontSize: 18, fontWeight: '700' },
  headingBlock: { backgroundColor: '#f3f4f6', padding: 12, borderRadius: 8 },
  headingText: { fontSize: 14, color: '#111827' },
  overlaySection: {
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: '#f9fafb', fontSize: 16, fontWeight: '700' },
  offlineBadge: {
    backgroundColor: '#78350f',
    color: '#fef08a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '600',
  },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pickerButton: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  pickerButtonLabel: { color: '#f9fafb', fontWeight: '600', fontSize: 14 },
  pickerButtonHint: { color: '#9ca3af', fontSize: 12 },
  pickerDropdown: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    overflow: 'hidden',
  },
  pickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2937',
  },
  pickerItemActive: { backgroundColor: '#1e3a8a' },
  pickerItemLabel: { color: '#f9fafb', fontWeight: '600', fontSize: 14 },
  pickerItemMeta: { color: '#cbd5f5', fontSize: 11, marginTop: 2 },
  overlayCanvasWrapper: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlaySvg: { borderRadius: 12 },
  overlayPlaceholder: {
    width: OVERLAY_SIZE,
    height: OVERLAY_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  overlayPlaceholderText: { color: '#94a3b8', fontSize: 12 },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  zoomButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomButtonLabel: { color: '#f9fafb', fontSize: 18, fontWeight: '700' },
  zoomLabel: { color: '#d1d5db', fontWeight: '600' },
  distanceRow: { flexDirection: 'row', gap: 12 },
  distanceCard: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  distanceLabel: {
    color: '#94a3b8',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  distanceValue: { color: '#f9fafb', fontSize: 20, fontWeight: '700' },
  distanceMeta: { color: '#cbd5f5', fontSize: 11 },
  overlayFootnote: { color: '#9ca3af', fontSize: 12, textAlign: 'right' },
  buttonsRow: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  startButton: { backgroundColor: '#1e3a8a' },
  stopButton: { backgroundColor: '#7f1d1d' },
  secondaryButton: { backgroundColor: '#1f2937' },
  disabledButton: { opacity: 0.4 },
  buttonText: { color: '#f9fafb', fontWeight: '600' },
  logContainer: { backgroundColor: '#0f172a', padding: 12, borderRadius: 8 },
  logTitle: { color: '#f9fafb', fontWeight: '700', marginBottom: 8 },
  logEntry: { color: '#f9fafb', fontSize: 12, marginBottom: 4 },
});

export default QAArHudScreen;

export type LocationFix = {
  lat: number;
  lon: number;
  acc_m: number;
  accuracy_m: number;
  timestamp: number;
  sats?: number | null;
  dop?: number | null;
  dualFreqGuess?: boolean | null;
};

export type PermissionStatus = 'undetermined' | 'denied' | 'granted' | 'restricted';

export type LocationErrorCode = 'permission-denied' | 'unavailable';

export class LocationError extends Error {
  code: LocationErrorCode;

  constructor(code: LocationErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'LocationError';
  }
}

type ExpoLocationModule = typeof import('expo-location');

let modulePromise: Promise<ExpoLocationModule | null> | null = null;
let lastPermission: PermissionStatus | null = null;

type DeviceModule = typeof import('expo-device');

let deviceModulePromise: Promise<DeviceModule | null> | null = null;

const PRO_PRECISION_MODEL_KEYWORDS = [
  'pixel 5',
  'pixel 6',
  'pixel 6 pro',
  'pixel 6a',
  'pixel 7',
  'pixel 7 pro',
  'pixel 7a',
  'pixel 8',
  'pixel 8 pro',
  'pixel 8a',
  'pixel 9',
  'pixel 9 pro',
  'pixel 9 pro xl',
  'pixel 9 pro fold',
  'pixel 9a',
  'galaxy s21',
  'galaxy s22',
  'galaxy s23',
  'galaxy s24',
  'galaxy note 20 ultra',
  'galaxy note20 ultra',
  'galaxy z fold4',
  'galaxy z fold5',
  'galaxy z fold6',
  'oneplus 10 pro',
  'oneplus 11',
  'oneplus 12',
  'xiaomi 12',
  'xiaomi 13',
  'xiaomi 14',
  'honor magic4 pro',
  'honor magic5 pro',
  'asus zenfone 9',
  'asus zenfone 10',
  'sony xperia 1 iv',
  'sony xperia 1 v',
];

const PRO_PRECISION_MODEL_ID_PREFIXES = [
  'sm-s90',
  'sm-s91',
  'sm-s92',
  'sm-s93',
  'sm-s94',
  'sm-s95',
  'sm-n98',
  'sm-f93',
  'sm-f94',
  'sm-f95',
  'sm-f96',
];

async function loadModule(): Promise<ExpoLocationModule | null> {
  if (!modulePromise) {
    modulePromise = import('expo-location').catch(() => null);
  }
  return modulePromise;
}

async function loadDeviceModule(): Promise<DeviceModule | null> {
  if (!deviceModulePromise) {
    deviceModulePromise = import('expo-device').catch(() => null);
  }
  return deviceModulePromise;
}

type DeviceDetails = { modelName: string | null; modelId: string | null };

let cachedDeviceDetails: DeviceDetails | null = null;

async function resolveDeviceDetails(): Promise<DeviceDetails> {
  if (cachedDeviceDetails) {
    return cachedDeviceDetails;
  }
  try {
    const Device = await loadDeviceModule();
    const details: DeviceDetails = {
      modelName: Device && typeof Device.modelName === 'string' ? Device.modelName : null,
      modelId: Device && typeof Device.modelId === 'string' ? Device.modelId : null,
    };
    cachedDeviceDetails = details;
    return details;
  } catch {
    cachedDeviceDetails = { modelName: null, modelId: null };
    return cachedDeviceDetails;
  }
}

function normalizeDeviceString(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isProPrecisionDevice(modelName: string | null, modelId: string | null): boolean {
  const normalizedName = normalizeDeviceString(modelName);
  const normalizedId = normalizeDeviceString(modelId);
  if (normalizedName) {
    for (const keyword of PRO_PRECISION_MODEL_KEYWORDS) {
      if (normalizedName.includes(keyword)) {
        return true;
      }
    }
  }
  if (normalizedId) {
    for (const prefix of PRO_PRECISION_MODEL_ID_PREFIXES) {
      if (normalizedId.startsWith(prefix)) {
        return true;
      }
    }
  }
  return false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function clampNonNegative(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, value);
}

function gatherSources(position: unknown): Record<string, unknown>[] {
  const root = asRecord(position);
  const coords = root ? asRecord(root.coords) : null;
  const extras = root ? asRecord(root.extras) : null;
  const android = root ? asRecord(root.android) : null;
  const androidExtras = android ? asRecord(android.extras) : null;
  const ios = root ? asRecord((root as { ios?: unknown }).ios) : null;
  const iosExtras = ios ? asRecord(ios.extras) : null;
  const sources = [coords, extras, android, androidExtras, ios, iosExtras, root];
  return sources.filter((item): item is Record<string, unknown> => Boolean(item));
}

function firstFiniteNumber(
  sources: Record<string, unknown>[],
  keys: string[],
): number | null {
  for (const source of sources) {
    for (const key of keys) {
      if (key in source) {
        const numeric = toNumber(source[key]);
        if (numeric !== null) {
          return numeric;
        }
      }
    }
  }
  return null;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function readBoolean(sources: Record<string, unknown>[], keys: string[]): boolean | null {
  for (const source of sources) {
    for (const key of keys) {
      if (key in source) {
        const parsed = parseBoolean(source[key]);
        if (parsed !== null) {
          return parsed;
        }
      }
    }
  }
  return null;
}

function collectCarrierFrequencies(value: unknown): number[] {
  const result: number[] = [];
  const push = (candidate: unknown) => {
    const numeric = toNumber(candidate);
    if (numeric !== null) {
      result.push(numeric);
    }
  };
  if (Array.isArray(value)) {
    for (const item of value) {
      if (Array.isArray(item)) {
        for (const nested of item) {
          push(nested);
        }
      } else if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        if ('carrierFrequencyHz' in record) {
          push(record.carrierFrequencyHz);
        } else if ('frequencyHz' in record) {
          push(record.frequencyHz);
        }
      } else {
        push(item);
      }
    }
    return result;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('carrierFrequencyHz' in record) {
      push(record.carrierFrequencyHz);
    }
    if ('frequencies' in record && Array.isArray(record.frequencies)) {
      for (const nested of record.frequencies) {
        push(nested);
      }
    }
    if ('primary' in record && Array.isArray(record.primary)) {
      for (const nested of record.primary) {
        push(nested);
      }
    }
    return result;
  }
  push(value);
  return result;
}

function detectDualFrequency(sources: Record<string, unknown>[]): boolean | null {
  const boolean = readBoolean(sources, [
    'dualFrequency',
    'isDualFrequency',
    'hasDualFrequency',
    'dual_freq',
    'dualFrequencyUsed',
  ]);
  if (boolean !== null) {
    return boolean;
  }

  for (const source of sources) {
    const signal = source.signalType ?? source.band ?? source.bands ?? source.signals;
    if (typeof signal === 'string') {
      const normalized = signal.toLowerCase();
      if (normalized.includes('l5') || normalized.includes('e5')) {
        return true;
      }
    }
    const carriers: number[] = [];
    const candidateKeys = [
      'carrierFrequencies',
      'carrierFrequencyHz',
      'carrierFrequenciesHz',
      'usedCarrierFrequencies',
      'frequencies',
      'bands',
    ];
    for (const key of candidateKeys) {
      if (key in source) {
        carriers.push(...collectCarrierFrequencies(source[key]));
      }
    }
    if (carriers.length) {
      const unique = Array.from(new Set(carriers.filter((value) => Number.isFinite(value))));
      if (unique.length >= 2) {
        unique.sort((a, b) => a - b);
        const min = unique[0]!;
        const max = unique[unique.length - 1]!;
        if (max - min >= 100_000_000) {
          return true;
        }
      }
    }
  }

  return null;
}

function permissionGranted(status: PermissionStatus | null, granted: boolean | undefined): boolean {
  if (typeof granted === 'boolean') {
    return granted;
  }
  if (!status) {
    return false;
  }
  return status === 'granted';
}

export async function getLocation(): Promise<LocationFix> {
  const Location = await loadModule();
  if (!Location || !Location.requestForegroundPermissionsAsync || !Location.getCurrentPositionAsync) {
    throw new LocationError('unavailable', 'Location services unavailable');
  }

  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    lastPermission = permission.status;
    if (!permissionGranted(permission.status ?? null, permission.granted)) {
      throw new LocationError('permission-denied', 'Location permission denied');
    }
  } catch (error) {
    if (error instanceof LocationError) {
      throw error;
    }
    throw new LocationError('unavailable', 'Failed to request location permission');
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      maximumAge: 5000,
      timeout: 10000,
    });
    const { latitude, longitude, accuracy } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new LocationError('unavailable', 'Invalid location fix');
    }
    const acc =
      Number.isFinite(accuracy) && typeof accuracy === 'number' ? Math.max(accuracy, 0) : Number.POSITIVE_INFINITY;
    const sources = gatherSources(position);
    const satellitesRaw = firstFiniteNumber(sources, [
      'satelliteCount',
      'satellites',
      'usedSatellites',
      'used_satellites',
      'usedInFix',
      'usedInFixCount',
      'visibleSatellites',
      'sat_used',
      'sats',
    ]);
    const dopRaw = firstFiniteNumber(sources, [
      'hdop',
      'pdop',
      'gdop',
      'dop',
      'horizontalDop',
      'positionDilution',
      'position_dop',
      'accuracyHorizontal',
      'horizontalAccuracy',
    ]);
    const dualFromSources = detectDualFrequency(sources);
    let dualFreqGuess: boolean | null = dualFromSources;
    if (dualFreqGuess === null) {
      const device = await resolveDeviceDetails();
      if (device.modelName || device.modelId) {
        dualFreqGuess = isProPrecisionDevice(device.modelName, device.modelId);
      }
    }
    const timestamp = typeof position.timestamp === 'number' ? position.timestamp : Date.now();
    const sanitizedSats = clampNonNegative(satellitesRaw);
    const sanitizedDop = clampNonNegative(dopRaw);
    return {
      lat: latitude,
      lon: longitude,
      acc_m: acc,
      accuracy_m: Number.isFinite(acc) ? acc : Number.POSITIVE_INFINITY,
      timestamp,
      sats: sanitizedSats !== null ? Math.round(sanitizedSats) : undefined,
      dop: sanitizedDop ?? undefined,
      dualFreqGuess: dualFreqGuess ?? undefined,
    };
  } catch (error) {
    if (error instanceof LocationError) {
      throw error;
    }
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: string }).code;
      if (code === 'E_LOCATION_PERMISSIONS_DENIED') {
        throw new LocationError('permission-denied', 'Location permission denied');
      }
    }
    throw new LocationError('unavailable', 'Failed to obtain location fix');
  }
}

export function lastPermissionStatus(): PermissionStatus | null {
  return lastPermission;
}

const EARTH_RADIUS_M = 6_378_137;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export type DistancePoint = { lat: number; lon: number };

export function distanceMeters(a: DistancePoint, b: DistancePoint): number {
  const lat1 = toRadians(finiteNumber(a.lat));
  const lat2 = toRadians(finiteNumber(b.lat));
  const dLat = toRadians(finiteNumber(b.lat) - finiteNumber(a.lat));
  const dLon = toRadians(finiteNumber(b.lon) - finiteNumber(a.lon));
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return EARTH_RADIUS_M * c;
}

export function estimateSpeedMps(previous: LocationFix | null | undefined, current: LocationFix): number | null {
  if (!previous) {
    return null;
  }
  const deltaT = (finiteNumber(current.timestamp) - finiteNumber(previous.timestamp)) / 1000;
  if (!Number.isFinite(deltaT) || deltaT <= 0) {
    return null;
  }
  const distance = distanceMeters(previous, current);
  if (!Number.isFinite(distance)) {
    return null;
  }
  return distance / deltaT;
}

export type SpeedSample = { timestamp: number; speed_mps: number };

export interface SpeedAverageFilter {
  push(sample: SpeedSample): number | null;
  value(): number | null;
  reset(): void;
}

export function createSpeedAverageFilter(windowMs = 3000): SpeedAverageFilter {
  const samples: SpeedSample[] = [];
  let sum = 0;
  const clampSpeed = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
  return {
    push(sample: SpeedSample): number | null {
      const timestamp = finiteNumber(sample.timestamp, Date.now());
      const speed = clampSpeed(sample.speed_mps);
      samples.push({ timestamp, speed_mps: speed });
      sum += speed;
      const cutoff = timestamp - Math.max(windowMs, 0);
      while (samples.length && samples[0]!.timestamp < cutoff) {
        const removed = samples.shift();
        if (removed) {
          sum -= removed.speed_mps;
        }
      }
      return samples.length ? sum / samples.length : null;
    },
    value(): number | null {
      return samples.length ? sum / samples.length : null;
    },
    reset(): void {
      samples.splice(0, samples.length);
      sum = 0;
    },
  };
}

export function createExponentialSpeedFilter(alpha = 0.25): SpeedAverageFilter {
  const clampSpeed = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
  let current: number | null = null;
  return {
    push(sample: SpeedSample): number | null {
      const speed = clampSpeed(sample.speed_mps);
      if (current === null) {
        current = speed;
      } else {
        current = current + alpha * (speed - current);
      }
      return current;
    },
    value(): number | null {
      return current;
    },
    reset(): void {
      current = null;
    },
  };
}

export type GnssAccuracyLevel = 'good' | 'ok' | 'poor' | 'unknown';

export function gnssAccuracyLevel(accuracy: number | null | undefined): GnssAccuracyLevel {
  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy)) {
    return 'unknown';
  }
  if (accuracy < 2) {
    return 'good';
  }
  if (accuracy <= 5) {
    return 'ok';
  }
  return 'poor';
}

export function formatAccuracyMeters(accuracy: number | null | undefined): string {
  if (typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0) {
    const decimals = accuracy >= 10 ? 0 : 1;
    return `±${accuracy.toFixed(decimals)} m`;
  }
  return '±— m';
}

export function formatSatelliteCount(satellites: number | null | undefined): string {
  if (typeof satellites === 'number' && Number.isFinite(satellites)) {
    const rounded = Math.max(0, Math.round(satellites));
    if (rounded > 0) {
      return `sats: ${rounded}`;
    }
  }
  return 'sats: —';
}

function trimTrailingZeros(value: string): string {
  return value.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');
}

export function formatDop(dop: number | null | undefined): string {
  if (typeof dop === 'number' && Number.isFinite(dop) && dop > 0) {
    let decimals = 1;
    if (dop < 1) {
      decimals = 2;
    } else if (dop >= 10) {
      decimals = 0;
    }
    const formatted = trimTrailingZeros(dop.toFixed(decimals));
    return `DOP: ${formatted}`;
  }
  return 'DOP: —';
}

export function formatDualFrequency(value: boolean | null | undefined): string {
  return value === true ? 'L1/L5 ✓' : 'L1/L5 –';
}

export type LocationFix = {
  lat: number;
  lon: number;
  acc_m: number;
  timestamp: number;
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

async function loadModule(): Promise<ExpoLocationModule | null> {
  if (!modulePromise) {
    modulePromise = import('expo-location').catch(() => null);
  }
  return modulePromise;
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
    const acc = Number.isFinite(accuracy) && typeof accuracy === 'number' ? Math.max(accuracy, 0) : Number.POSITIVE_INFINITY;
    return {
      lat: latitude,
      lon: longitude,
      acc_m: acc,
      timestamp: typeof position.timestamp === 'number' ? position.timestamp : Date.now(),
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

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

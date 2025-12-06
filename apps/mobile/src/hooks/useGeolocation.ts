import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type LatLon = { lat: number; lon: number };

export type MobileGeolocationState = {
  position: LatLon | null;
  error: Error | null;
  supported: boolean;
  loading: boolean;
};

const defaultState: MobileGeolocationState = {
  position: null,
  error: null,
  supported: true,
  loading: false,
};

export function useGeolocation(): MobileGeolocationState {
  const [state, setState] = useState<MobileGeolocationState>(defaultState);

  useEffect(() => {
    let watchId: number | null = null;
    const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;

    if (!geo || typeof geo.watchPosition !== 'function') {
      setState((prev) => ({ ...prev, supported: false }));
      return undefined;
    }

    setState((prev) => ({ ...prev, loading: true }));

    try {
      watchId = geo.watchPosition(
        (pos) => {
          setState({
            position: { lat: pos.coords.latitude, lon: pos.coords.longitude },
            error: null,
            supported: true,
            loading: false,
          });
        },
        (err) => {
          setState((prev) => ({
            ...prev,
            error: err instanceof Error ? err : new Error('Geolocation error'),
            loading: false,
          }));
        },
        { enableHighAccuracy: Platform.OS !== 'web' },
      );
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err : new Error('Geolocation unavailable'),
        supported: false,
        loading: false,
      }));
    }

    return () => {
      if (watchId != null && typeof geo.clearWatch === 'function') {
        geo.clearWatch(watchId);
      }
    };
  }, []);

  return state;
}

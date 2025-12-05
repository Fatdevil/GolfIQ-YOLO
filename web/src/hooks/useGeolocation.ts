import { useEffect, useState } from "react";

export type GeoPosition = {
  lat: number;
  lon: number;
};

export type GeolocationState = {
  position: GeoPosition | null;
  error: Error | null;
  supported: boolean;
  loading: boolean;
};

const buildDefaultState = (): GeolocationState => ({
  position: null,
  error: null,
  supported: typeof navigator !== "undefined" && "geolocation" in navigator,
  loading: false,
});

export function useGeolocation(enabled: boolean): GeolocationState {
  const [state, setState] = useState<GeolocationState>(buildDefaultState);

  useEffect(() => {
    if (!enabled || !buildDefaultState().supported) {
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          position: {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          },
          error: null,
          supported: true,
          loading: false,
        });
      },
      (err) => {
        setState((prev) => ({
          ...prev,
          error: new Error(err.message),
          loading: false,
        }));
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 10_000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled]);

  return state;
}

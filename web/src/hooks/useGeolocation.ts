import { useEffect, useState } from "react";

export type GeoPosition = {
  lat: number;
  lon: number;
};

export function useGeolocation(
  enabled: boolean
): { position?: GeoPosition; error?: Error } {
  const [position, setPosition] = useState<GeoPosition | undefined>();
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
        setError(undefined);
      },
      (err) => {
        setError(new Error(err.message));
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 10_000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled]);

  return { position, error };
}

import { useCallback, useEffect, useState } from "react";

import { API, withAuth } from "@web/api";
import type { GeoPosition } from "@web/hooks/useGeolocation";

export type AutoHoleSuggestion = {
  suggestedHole: number;
  confidence: number;
  reason: string;
};

export function useAutoHoleSuggestion(params: {
  courseId?: string;
  currentHole: number;
  position?: GeoPosition;
  enabled: boolean;
}) {
  const { courseId, currentHole, position, enabled } = params;
  const [suggestion, setSuggestion] = useState<AutoHoleSuggestion | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSuggestion(null);
      return;
    }
    if (!courseId || !position) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(`${API}/api/auto-hole`, {
          method: "POST",
          headers: withAuth({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            courseId,
            lat: position.lat,
            lon: position.lon,
            currentHole,
          }),
          signal: controller.signal,
        });
        if (!response.ok || cancelled) {
          if (!response.ok) {
            setSuggestion(null);
          }
          return;
        }
        const data = await response.json();
        if (cancelled) {
          return;
        }

        if (
          typeof data.suggestedHole === "number" &&
          data.suggestedHole !== currentHole
        ) {
          setSuggestion({
            suggestedHole: data.suggestedHole,
            confidence: data.confidence ?? 0,
            reason: data.reason ?? "unknown",
          });
        } else {
          setSuggestion(null);
        }
      } catch (error) {
        if (!cancelled) {
          setSuggestion(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, courseId, currentHole, position?.lat, position?.lon]);

  const clear = useCallback(() => setSuggestion(null), []);

  return { suggestion, clear } as const;
}

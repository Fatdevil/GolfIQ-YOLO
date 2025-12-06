import { useMemo } from "react";

import {
  computeAutoHoleSuggestion,
  distanceMeters,
  type AutoHoleSuggestion,
  type CourseLayout,
  type LatLon,
} from "@shared/round/autoHoleCore";
import type { GeolocationState } from "./useGeolocation";

export { distanceMeters };
export type { AutoHoleSuggestion };

function isGeolocationPosition(position: unknown): position is GeolocationPosition {
  return (
    typeof position === "object" &&
    position !== null &&
    "coords" in position &&
    typeof (position as GeolocationPosition).coords === "object"
  );
}

function normalizePosition(position: GeolocationState["position"]): LatLon | null {
  if (!position) return null;
  if (isGeolocationPosition(position)) {
    return { lat: position.coords.latitude, lon: position.coords.longitude };
  }
  return position;
}

export function useAutoHoleSuggest(
  course: CourseLayout | null,
  geo: GeolocationState
): AutoHoleSuggestion {
  return useMemo(() => {
    const position = normalizePosition(geo.position);

    if (!geo.supported) {
      return { suggestedHole: null, distanceToSuggestedM: null, confidence: "low" };
    }

    return computeAutoHoleSuggestion(course, position);
  }, [course, geo.position, geo.supported]);
}

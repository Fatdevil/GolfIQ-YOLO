import { useMemo } from "react";

import type { CourseLayout, LatLon } from "../types/course";
import type { GeolocationState } from "./useGeolocation";

export type AutoHoleSuggestion = {
  suggestedHole: number | null;
  distanceToSuggestedM: number | null;
  confidence: "low" | "medium" | "high";
};

const EARTH_RADIUS_M = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const hav =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(hav));
}

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

    if (!course || !position || !geo.supported) {
      return { suggestedHole: null, distanceToSuggestedM: null, confidence: "low" };
    }

    let closest: { hole: number; distance: number } | null = null;

    for (const hole of course.holes) {
      const distance = distanceMeters(position, hole.tee);
      if (!closest || distance < closest.distance) {
        closest = { hole: hole.number, distance };
      }
    }

    if (!closest) {
      return { suggestedHole: null, distanceToSuggestedM: null, confidence: "low" };
    }

    if (closest.distance > 200) {
      return { suggestedHole: null, distanceToSuggestedM: closest.distance, confidence: "low" };
    }

    const confidence: AutoHoleSuggestion["confidence"] =
      closest.distance < 40 ? "high" : closest.distance < 80 ? "medium" : "low";

    return {
      suggestedHole: closest.hole,
      distanceToSuggestedM: closest.distance,
      confidence,
    };
  }, [course, geo.position, geo.supported]);
}

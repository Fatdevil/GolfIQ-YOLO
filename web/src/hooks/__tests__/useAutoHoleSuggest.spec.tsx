import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useAutoHoleSuggest, distanceMeters } from "../useAutoHoleSuggest";
import type { CourseLayout } from "@/types/course";
import type { GeolocationState } from "../useGeolocation";

const demoCourse: CourseLayout = {
  id: "demo-course",
  name: "Demo Course",
  holes: [
    { number: 1, tee: { lat: 59.3, lon: 18.1 }, green: { lat: 59.301, lon: 18.101 } },
    { number: 2, tee: { lat: 59.3015, lon: 18.103 }, green: { lat: 59.302, lon: 18.1045 } },
  ],
};

const baseGeo: GeolocationState = {
  position: null,
  error: null,
  supported: true,
  loading: false,
};

describe("useAutoHoleSuggest", () => {
  it("returns null suggestion when inputs are missing", () => {
    const { result } = renderHook(() => useAutoHoleSuggest(null, baseGeo));

    expect(result.current).toEqual({
      suggestedHole: null,
      distanceToSuggestedM: null,
      confidence: "low",
    });
  });

  it("selects the nearest hole and confidence tier", () => {
    const closePosition: GeolocationState = {
      ...baseGeo,
      position: { lat: demoCourse.holes[0].tee.lat, lon: demoCourse.holes[0].tee.lon },
    };
    const { result: closeResult } = renderHook(() =>
      useAutoHoleSuggest(demoCourse, closePosition)
    );

    expect(closeResult.current.suggestedHole).toBe(1);
    expect(closeResult.current.confidence).toBe("high");

    const mediumDistance = distanceMeters(
      demoCourse.holes[0].tee,
      { lat: demoCourse.holes[0].tee.lat + 0.0005, lon: demoCourse.holes[0].tee.lon }
    );
    expect(mediumDistance).toBeGreaterThan(40);
    expect(mediumDistance).toBeLessThan(80);

    const mediumPosition: GeolocationState = {
      ...baseGeo,
      position: { lat: demoCourse.holes[0].tee.lat + 0.0005, lon: demoCourse.holes[0].tee.lon },
    };
    const { result: mediumResult } = renderHook(() =>
      useAutoHoleSuggest(demoCourse, mediumPosition)
    );

    expect(mediumResult.current.suggestedHole).toBe(1);
    expect(mediumResult.current.confidence).toBe("medium");
  });

  it("drops suggestion when far from every hole", () => {
    const farPosition: GeolocationState = {
      ...baseGeo,
      position: { lat: 0, lon: 0 },
    };
    const { result } = renderHook(() => useAutoHoleSuggest(demoCourse, farPosition));

    expect(result.current.suggestedHole).toBeNull();
    expect(result.current.confidence).toBe("low");
  });
});

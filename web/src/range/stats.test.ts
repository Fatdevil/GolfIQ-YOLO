import { describe, expect, it } from "vitest";
import { computeRangeSummary } from "./stats";
import type { RangeShot } from "./types";

describe("computeRangeSummary", () => {
  it("returns empty summary when no shots", () => {
    expect(computeRangeSummary([])).toEqual({
      shots: 0,
      avgBallSpeedMps: null,
      avgCarryM: null,
      dispersionSideDeg: null,
    });
  });

  it("computes averages and dispersion", () => {
    const shots: RangeShot[] = [
      {
        id: "1",
        ts: 1000,
        club: "7i",
        metrics: {
          ballSpeedMps: 50,
          ballSpeedMph: 112.0,
          carryM: 150,
          launchDeg: 12,
          sideAngleDeg: 1,
          quality: "good",
        },
      },
      {
        id: "2",
        ts: 2000,
        club: "7i",
        metrics: {
          ballSpeedMps: 52,
          ballSpeedMph: 116.4,
          carryM: 152,
          launchDeg: 13,
          sideAngleDeg: -1,
          quality: "medium",
        },
      },
      {
        id: "3",
        ts: 3000,
        club: "7i",
        metrics: {
          ballSpeedMps: null,
          ballSpeedMph: null,
          carryM: null,
          launchDeg: null,
          sideAngleDeg: null,
          quality: "poor",
        },
      },
    ];

    const summary = computeRangeSummary(shots);

    expect(summary.shots).toBe(3);
    expect(summary.avgBallSpeedMps).toBeCloseTo((50 + 52) / 2, 5);
    expect(summary.avgCarryM).toBeCloseTo((150 + 152) / 2, 5);
    expect(summary.dispersionSideDeg).toBeCloseTo(1, 5);
  });
});

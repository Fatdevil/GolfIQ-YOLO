import { describe, expect, it } from "vitest";

import { computeGappingStats, recommendedCarry } from "@web/bag/gapping";
import type { RangeShot } from "@web/range/types";

function buildShot(carry: number | null, clubId = "7i"): RangeShot {
  return {
    id: `shot-${clubId}-${carry ?? "null"}`,
    ts: 0,
    club: clubId,
    clubId,
    clubLabel: clubId,
    metrics: {
      ballSpeedMps: null,
      ballSpeedMph: null,
      carryM: carry,
      launchDeg: null,
      sideAngleDeg: null,
      quality: "good",
    },
  };
}

describe("computeGappingStats", () => {
  it("computes aggregates for valid shots", () => {
    const shots: RangeShot[] = [buildShot(100), buildShot(110), buildShot(120)];

    const stats = computeGappingStats(shots);
    expect(stats).not.toBeNull();
    expect(stats?.clubId).toBe("7i");
    expect(stats?.samples).toBe(3);
    expect(stats?.meanCarry_m).toBeCloseTo(110, 5);
    expect(stats?.p25_m).toBeCloseTo(105, 5);
    expect(stats?.p50_m).toBeCloseTo(110, 5);
    expect(stats?.p75_m).toBeCloseTo(115, 5);
    expect(stats?.std_m).toBeCloseTo(10, 5);
  });

  it("ignores invalid shots and returns null when none remain", () => {
    const shots: RangeShot[] = [
      buildShot(null),
      buildShot(0),
      { ...buildShot(150), clubId: undefined, club: "" },
    ];

    const stats = computeGappingStats(shots);
    expect(stats).toBeNull();
  });
});

describe("recommendedCarry", () => {
  it("prefers p50 over mean", () => {
    const stats = {
      clubId: "7i",
      samples: 3,
      meanCarry_m: 120,
      p25_m: 110,
      p50_m: 115,
      p75_m: 125,
      std_m: 5,
    };
    expect(recommendedCarry(stats)).toBe(115);
  });

  it("falls back to mean when p50 missing", () => {
    const stats = {
      clubId: "7i",
      samples: 2,
      meanCarry_m: 130,
      p25_m: null,
      p50_m: null,
      p75_m: null,
      std_m: null,
    };
    expect(recommendedCarry(stats)).toBe(130);
  });

  it("returns null when stats missing", () => {
    expect(recommendedCarry(null)).toBeNull();
  });
});

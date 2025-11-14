import { describe, expect, it } from "vitest";

import {
  buildSprayBins,
  scoreTargetBingo,
  shotToSprayPoint,
} from "@web/features/range/games";
import type { RangeShot } from "@web/range/types";

const makeShot = (carryM: number | null, sideDeg: number | null = 0): RangeShot => ({
  id: `shot-${Math.random()}`,
  ts: Date.now(),
  club: "7i",
  metrics: {
    ballSpeedMps: null,
    ballSpeedMph: null,
    carryM,
    launchDeg: null,
    sideAngleDeg: sideDeg,
    quality: "medium",
  },
});

describe("scoreTargetBingo", () => {
  it("scores only the latest valid shots", () => {
    const shots: RangeShot[] = [
      makeShot(140, 0),
      makeShot(150, 0),
      makeShot(156, 0),
      makeShot(null, 0),
      makeShot(143, 0),
    ];

    const result = scoreTargetBingo(shots, {
      target_m: 150,
      tolerance_m: 5,
      maxShots: 4,
    });

    expect(result.totalShots).toBe(3);
    expect(result.hits).toBe(1);
    expect(result.misses).toBe(2);
    expect(result.hitRate_pct).toBeCloseTo((1 / 3) * 100);
    expect(result.avgAbsError_m).toBeCloseTo((0 + 6 + 7) / 3);
    expect(result.shots.map((shot) => shot.index)).toEqual([2, 3, 5]);
  });

  it("ignores shots without carry", () => {
    const shots: RangeShot[] = [makeShot(null, 0), makeShot(-10, 0)];

    const result = scoreTargetBingo(shots, {
      target_m: 100,
      tolerance_m: 5,
      maxShots: 5,
    });

    expect(result.totalShots).toBe(0);
    expect(result.hitRate_pct).toBe(0);
    expect(result.avgAbsError_m).toBeNull();
  });
});

describe("spray heatmap helpers", () => {
  it("converts shots to spray points", () => {
    const shot = makeShot(120, 5);
    const point = shotToSprayPoint(shot);

    expect(point).not.toBeNull();
    expect(point?.x_m).toBeCloseTo(120);
    expect(point?.y_m ?? 0).toBeGreaterThan(0);
  });

  it("bins shots into grid cells", () => {
    const shots: RangeShot[] = [
      makeShot(100, 0),
      makeShot(100, 5),
      makeShot(100, -5),
      makeShot(null, 0),
    ];

    const bins = buildSprayBins(shots, 5);

    const counts = Object.fromEntries(bins.map((bin) => [bin.key, bin.count]));

    expect(counts["20:0"]).toBe(1);
    expect(counts["20:1"]).toBe(1);
    expect(counts["20:-2"]).toBe(1);
    expect(bins.find((bin) => bin.key === "20:1")?.yCenter_m).toBeGreaterThan(0);
    expect(bins.find((bin) => bin.key === "20:-2")?.yCenter_m).toBeLessThan(0);
  });
});

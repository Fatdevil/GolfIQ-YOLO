import { describe, expect, it } from "vitest";
import { computePlaysLike, mergePlaysLikeCfg } from "@shared/playslike/PlaysLikeService";

const cfg = mergePlaysLikeCfg();

describe("percent_v1 plays-like model", () => {
  it("adds slope 1:1 with zero wind", () => {
    const result = computePlaysLike(150, 5, 0, cfg);
    expect(Math.abs(result.distanceEff - 155)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(result.components.slopeM - 5)).toBeLessThanOrEqual(0.1);
    expect(result.components.windM).toBeCloseTo(0, 5);
  });

  it("applies +1% per mph headwind under cap", () => {
    const result = computePlaysLike(150, 0, 5, cfg);
    expect(Math.abs(result.distanceEff - 166.8)).toBeLessThanOrEqual(0.8);
    expect(Math.abs(result.components.windM - 16.8)).toBeLessThanOrEqual(0.8);
  });

  it("applies -0.5% per mph tailwind under cap", () => {
    const result = computePlaysLike(150, 0, -5, cfg);
    expect(Math.abs(result.distanceEff - 141.6)).toBeLessThanOrEqual(0.8);
    expect(Math.abs(result.components.windM + 8.4)).toBeLessThanOrEqual(0.8);
  });

  it("combines slope and wind adjustments", () => {
    const result = computePlaysLike(150, -8, 3, cfg);
    expect(Math.abs(result.distanceEff - 152.1)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.components.slopeM + 8)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(result.components.windM - 10.1)).toBeLessThanOrEqual(1);
  });
});

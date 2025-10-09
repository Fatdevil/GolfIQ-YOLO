import { describe, expect, it } from "vitest";
import { computePlaysLike, mergePlaysLikeCfg } from "@shared/playslike/PlaysLikeService";

const cfg = mergePlaysLikeCfg();

const pctFromWind = (distance: number, windM: number) =>
  distance > 0 ? (windM / distance) * 100 : 0;

describe("percent_v1 plays-like model (literature_v1)", () => {
  it("adds slope 1:1 with zero wind", () => {
    const result = computePlaysLike(150, 5, 0, { cfg });
    expect(result.distanceEff).toBeGreaterThanOrEqual(154.0);
    expect(result.distanceEff).toBeLessThanOrEqual(156.0);
    expect(result.components.slopeM).toBeGreaterThanOrEqual(4.9);
    expect(result.components.slopeM).toBeLessThanOrEqual(5.1);
    expect(Math.abs(result.components.windM)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(result.components.tempM)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(result.components.altM)).toBeLessThanOrEqual(0.1);
  });

  it("applies +1% per mph headwind for mid irons", () => {
    const result = computePlaysLike(150, 0, 5, { cfg, clubClass: "midIron" });
    const pct = pctFromWind(150, result.components.windM);
    expect(pct).toBeGreaterThanOrEqual(10.5);
    expect(pct).toBeLessThanOrEqual(12.5);
  });

  it("applies -0.5% per mph tailwind for mid irons", () => {
    const result = computePlaysLike(150, 0, -5, { cfg, clubClass: "midIron" });
    const pct = pctFromWind(150, result.components.windM);
    expect(result.distanceEff).toBeGreaterThanOrEqual(141.0);
    expect(result.distanceEff).toBeLessThanOrEqual(142.5);
    expect(pct).toBeGreaterThanOrEqual(-6.5);
    expect(pct).toBeLessThanOrEqual(-4.5);
  });

  it("combines slope and wind adjustments for drivers", () => {
    const result = computePlaysLike(150, -8, 3, { cfg, clubClass: "driver" });
    expect(result.distanceEff).toBeGreaterThanOrEqual(150.0);
    expect(result.distanceEff).toBeLessThanOrEqual(154.0);
    expect(result.components.slopeM).toBeGreaterThanOrEqual(-8.1);
    expect(result.components.slopeM).toBeLessThanOrEqual(-7.9);
    expect(result.components.windM).toBeGreaterThanOrEqual(6.0);
    expect(result.components.windM).toBeLessThanOrEqual(12.0);
  });

  it("reduces headwind impact for drivers versus mid irons", () => {
    const driver = computePlaysLike(200, 0, 5, { cfg, clubClass: "driver" });
    const midIron = computePlaysLike(200, 0, 5, { cfg, clubClass: "midIron" });
    expect(pctFromWind(200, driver.components.windM)).toBeLessThan(
      pctFromWind(200, midIron.components.windM),
    );
  });

  it("boosts headwind impact slightly for wedges", () => {
    const wedge = computePlaysLike(120, 0, 5, { cfg, clubClass: "wedge" });
    const midIron = computePlaysLike(120, 0, 5, { cfg, clubClass: "midIron" });
    expect(pctFromWind(120, wedge.components.windM)).toBeGreaterThan(
      pctFromWind(120, midIron.components.windM),
    );
  });
});

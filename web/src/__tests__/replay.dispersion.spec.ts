import { describe, expect, it } from "vitest";

import { computeDispersion, parseShotLog } from "../features/replay/utils/parseShotLog";
import { makeShot } from "./helpers/factories";

const EARTH_RADIUS_M = 6_378_137;

function metersToLat(deltaMeters: number): number {
  return (deltaMeters / EARTH_RADIUS_M) * (180 / Math.PI);
}

function metersToLon(deltaMeters: number, latitudeDeg: number): number {
  return (deltaMeters / (EARTH_RADIUS_M * Math.cos((latitudeDeg * Math.PI) / 180))) * (180 / Math.PI);
}

describe("parseShotLog", () => {
  it("ignores telemetry events and converts shots to relative offsets", () => {
    const records = [
      { timestampMs: 0, event: "hud.frame", data: { fps: 60 } },
      {
        shotId: "shot-1",
        tStart: 1_000,
        tEnd: 1_500,
        club: "7i",
        base_m: 160,
        playsLike_m: 165,
        deltas: { temp: 1, alt: 0, head: -2, slope: 0.5 },
        pin: { lat: 0, lon: 0 },
        land: {
          lat: metersToLat(10),
          lon: metersToLon(5, 0),
        },
        carry_m: 170,
        heading_deg: 0,
      },
      {
        shotId: "shot-2",
        tStart: 2_000,
        tEnd: 2_800,
        club: "5i",
        base_m: 175,
        playsLike_m: 180,
        deltas: { temp: 0, alt: 1, head: -1, slope: 0 },
        pin: { lat: 0, lon: 0 },
        land: {
          lat: metersToLat(5),
          lon: metersToLon(10, 0),
        },
        carry_m: 182,
        heading_deg: 90,
      },
    ];

    const shots = parseShotLog(records);

    expect(shots).toHaveLength(2);
    const first = shots[0];
    expect(first.shotId).toBe("shot-1");
    expect(first.durationMs).toBe(500);
    expect(first.relative).not.toBeNull();
    expect(first.relative?.y).toBeCloseTo(10, 3);
    expect(first.relative?.x).toBeCloseTo(5, 3);

    const second = shots[1];
    expect(second.relative).not.toBeNull();
    expect(second.relative?.y).toBeCloseTo(10, 3);
    expect(second.relative?.x).toBeCloseTo(-5, 3);
  });
});

describe("computeDispersion", () => {
  it("summarises carry, spread, and directional bias", () => {
    const summary = computeDispersion([
      makeShot({
        shotId: "a",
        relative: { x: 2, y: -5, distance: Math.hypot(2, -5) },
        carry_m: 150,
      }),
      makeShot({
        shotId: "b",
        relative: { x: -3, y: 10, distance: Math.hypot(-3, 10) },
        carry_m: 155,
      }),
      makeShot({
        shotId: "c",
        relative: { x: 0.05, y: 1, distance: Math.hypot(0.05, 1) },
        carry_m: null,
      }),
    ]);

    expect(summary.count).toBe(3);
    expect(summary.avgCarry).toBeCloseTo(152.5, 3);
    expect(summary.stdCarry).toBeCloseTo(2.5, 3);
    expect(summary.meanX).toBeCloseTo(-0.3167, 3);
    expect(summary.meanY).toBeCloseTo(2, 3);
    expect(summary.pctShort).toBeCloseTo(33.333, 3);
    expect(summary.pctLong).toBeCloseTo(66.667, 3);
    expect(summary.pctLeft).toBeCloseTo(33.333, 3);
    expect(summary.pctRight).toBeCloseTo(33.333, 3);
  });
});

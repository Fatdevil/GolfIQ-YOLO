import { describe, expect, it } from 'vitest';

import { bearing, haversine, shortArcDiff, shouldUpdate, speedFromTrace } from '../../../shared/follow/geo';
import type { GeoPoint } from '../../../shared/follow/types';

describe('follow geo helpers', () => {
  const makePoint = (lat: number, lon: number, ts?: number): GeoPoint => ({ lat, lon, ts });

  it('computes haversine distance in meters', () => {
    const sf = makePoint(37.7749, -122.4194);
    const la = makePoint(34.0522, -118.2437);
    const distance = haversine(sf, la);
    expect(distance).toBeGreaterThan(500_000);
    expect(distance).toBeLessThan(650_000);
  });

  it('computes compass bearing', () => {
    const start = makePoint(0, 0);
    const east = makePoint(0, 1);
    const northEast = makePoint(1, 1);
    expect(bearing(start, east)).toBeCloseTo(90, 1);
    expect(bearing(start, northEast)).toBeGreaterThan(0);
    expect(bearing(start, northEast)).toBeLessThan(90);
  });

  it('returns shortest angular difference', () => {
    expect(shortArcDiff(10, 350)).toBeCloseTo(20, 5);
    expect(shortArcDiff(350, 10)).toBeCloseTo(-20, 5);
    expect(shortArcDiff(180, -180)).toBe(0);
  });

  it('derives speed from timestamped samples', () => {
    const samples: GeoPoint[] = [
      makePoint(37.0, -122.0, 1_000),
      makePoint(37.0005, -122.0005, 3_000),
    ];
    const speed = speedFromTrace(samples);
    expect(speed).toBeGreaterThan(0);
    expect(speed).toBeLessThan(60);
  });

  it('guards against missing timestamps when computing speed', () => {
    const samples: GeoPoint[] = [makePoint(37.0, -122.0), makePoint(37.0005, -122.0005)];
    expect(speedFromTrace(samples)).toBe(0);
  });

  it('evaluates throttling windows', () => {
    const now = Date.now();
    expect(shouldUpdate(1, now - 1200, now)).toBe(true);
    expect(shouldUpdate(1, now - 200, now)).toBe(false);
    expect(shouldUpdate(0.3, now - 4000, now)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import {
  corridorPolygon,
  fitTransform,
  ringPolygon,
  XY,
} from '../geom';

describe('fitTransform', () => {
  it('provides reversible transforms within floating tolerance', () => {
    const worldMin: XY = { x: -50, y: -20 };
    const worldMax: XY = { x: 120, y: 80 };
    const { toScreen, toWorld } = fitTransform(worldMin, worldMax, 800, 400);

    const worldPoint: XY = { x: 30, y: 25 };
    const screen = toScreen(worldPoint);
    const roundTrip = toWorld(screen);

    expect(roundTrip.x).toBeCloseTo(worldPoint.x, 6);
    expect(roundTrip.y).toBeCloseTo(worldPoint.y, 6);
  });
});

describe('corridorPolygon', () => {
  it('returns a four-point polygon around the line', () => {
    const corridor = corridorPolygon({ x: 0, y: 0 }, { x: 10, y: 0 }, 5);
    expect(corridor).toHaveLength(4);

    const width = Math.hypot(corridor[0].x - corridor[1].x, corridor[0].y - corridor[1].y);
    expect(width).toBeCloseTo(10, 5);
  });
});

describe('ringPolygon', () => {
  it('returns an n-gon approximating a circle', () => {
    const ring = ringPolygon({ x: 10, y: 5 }, 20, 32);
    expect(ring).toHaveLength(32);

    const first = ring[0];
    const dx = first.x - 10;
    const dy = first.y - 5;
    expect(Math.hypot(dx, dy)).toBeCloseTo(20, 6);
  });
});

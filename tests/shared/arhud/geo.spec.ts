import assert from 'node:assert/strict';
import test from 'node:test';

import {
  distancePointToLineString,
  distancePointToPolygonEdge,
  toLocalENU,
} from '../../../shared/arhud/geo';

function almostEqual(a: number, b: number, tolerance = 1): void {
  assert.ok(
    Math.abs(a - b) <= tolerance,
    `expected ${a} to be within ${tolerance} of ${b}`,
  );
}

test('toLocalENU approximates equirectangular offsets', () => {
  const origin = { lat: 37.7749, lon: -122.4194 };
  const target = { lat: 37.7759, lon: -122.4184 };
  const local = toLocalENU(origin, target);

  const dLat = ((target.lat - origin.lat) * Math.PI) / 180;
  const dLon = ((target.lon - origin.lon) * Math.PI) / 180;
  const meanLat = ((target.lat + origin.lat) / 2) * (Math.PI / 180);
  const expectedX = 6_378_137 * dLon * Math.cos(meanLat);
  const expectedY = 6_378_137 * dLat;

  almostEqual(local.x, expectedX, 0.75);
  almostEqual(local.y, expectedY, 0.75);
});

test('distancePointToLineString handles interior and exterior points', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
  ];

  const interior = distancePointToLineString({ x: 10, y: 4 }, line);
  almostEqual(interior, 4, 1e-6);

  const beyond = distancePointToLineString({ x: 40, y: 9 }, line);
  almostEqual(beyond, Math.hypot(10, 9), 1e-6);
});

test('distancePointToPolygonEdge computes nearest edge distance', () => {
  const square = {
    rings: [
      [
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 20],
      ],
    ],
  };

  const inside = distancePointToPolygonEdge({ x: 10, y: 10 }, square);
  almostEqual(inside, 10, 1e-6);

  const outside = distancePointToPolygonEdge({ x: 28, y: 8 }, square);
  almostEqual(outside, Math.hypot(8, 0), 1e-6);
});


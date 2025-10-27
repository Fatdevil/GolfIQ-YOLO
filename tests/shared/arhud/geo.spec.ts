import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bearingDeg,
  distancePointToLineString,
  distancePointToPolygonEdge,
  nearestFeature,
  toLocalENU,
  type GeoPoint,
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

test('bearingDeg normalises headings to north-based degrees', () => {
  const origin: GeoPoint = { lat: 59.331, lon: 18.061 };
  const meterToLat = (1 / 6_378_137) * (180 / Math.PI);
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  const meterToLon = meterToLat / cosLat;
  const north: GeoPoint = { lat: origin.lat + 50 * meterToLat, lon: origin.lon };
  const east: GeoPoint = { lat: origin.lat, lon: origin.lon + 50 * meterToLon };
  const southWest: GeoPoint = {
    lat: origin.lat - 30 * meterToLat,
    lon: origin.lon - 30 * meterToLon,
  };

  almostEqual(bearingDeg(origin, north), 0, 0.001);
  almostEqual(bearingDeg(origin, east), 90, 0.001);
  almostEqual(bearingDeg(origin, southWest), 225, 0.001);
});

function offsetToCoord(base: GeoPoint, eastMeters: number, northMeters: number): GeoPoint {
  const meterToLat = (1 / 6_378_137) * (180 / Math.PI);
  const cosLat = Math.cos((base.lat * Math.PI) / 180);
  const meterToLon = meterToLat / (cosLat || 1);
  return {
    lat: base.lat + northMeters * meterToLat,
    lon: base.lon + eastMeters * meterToLon,
  };
}

test('nearestFeature finds the closest polygon edge', () => {
  const origin: GeoPoint = { lat: 59.332, lon: 18.062 };
  const hazardRing = [
    offsetToCoord(origin, 40, -5),
    offsetToCoord(origin, 60, -5),
    offsetToCoord(origin, 60, 5),
    offsetToCoord(origin, 40, 5),
    offsetToCoord(origin, 40, -5),
  ].map(({ lon, lat }) => [lon, lat]);
  const fairwayRing = [
    offsetToCoord(origin, -5, -5),
    offsetToCoord(origin, -5, 5),
    offsetToCoord(origin, 5, 5),
    offsetToCoord(origin, 5, -5),
    offsetToCoord(origin, -5, -5),
  ].map(({ lon, lat }) => [lon, lat]);
  const bundle = {
    courseId: 'test',
    version: 1,
    ttlSec: 1,
    features: [
      {
        id: 'haz-1',
        type: 'hazard',
        geometry: {
          type: 'Polygon',
          coordinates: [hazardRing],
        },
      },
      {
        id: 'fair-1',
        type: 'fairway',
        geometry: {
          type: 'Polygon',
          coordinates: [fairwayRing],
        },
      },
    ],
    greensById: {},
  };

  const result = nearestFeature(origin, bundle);
  assert.ok(result);
  assert.equal(result?.id, 'haz-1');
  almostEqual(result?.dist_m ?? 0, 40, 1);
  almostEqual(result?.bearing ?? 0, 90, 2);
});

test('nearestFeature respects feature type filters', () => {
  const origin: GeoPoint = { lat: 59.333, lon: 18.063 };
  const bunkerRing = [
    offsetToCoord(origin, -30, -5),
    offsetToCoord(origin, -10, -5),
    offsetToCoord(origin, -10, 5),
    offsetToCoord(origin, -30, 5),
    offsetToCoord(origin, -30, -5),
  ].map(({ lon, lat }) => [lon, lat]);
  const hazardLine = [
    offsetToCoord(origin, 60, -20),
    offsetToCoord(origin, 60, 20),
  ].map(({ lon, lat }) => [lon, lat]);
  const bundle = {
    courseId: 'test',
    version: 1,
    ttlSec: 1,
    features: [
      {
        id: 'haz-line',
        type: 'water',
        geometry: {
          type: 'LineString',
          coordinates: hazardLine,
        },
      },
      {
        id: 'bunker-1',
        type: 'bunker',
        geometry: {
          type: 'Polygon',
          coordinates: [bunkerRing],
        },
      },
    ],
    greensById: {},
  };

  const bunkerOnly = nearestFeature(origin, bundle, ['bunker']);
  assert.ok(bunkerOnly);
  assert.equal(bunkerOnly?.id, 'bunker-1');
  almostEqual(bunkerOnly?.bearing ?? 0, 270, 2);
  const hazardOnly = nearestFeature(origin, bundle, ['water']);
  assert.ok(hazardOnly);
  assert.equal(hazardOnly?.id, 'haz-line');
  almostEqual(hazardOnly?.dist_m ?? 0, 60, 1);
  assert.equal(nearestFeature(origin, bundle, ['green']), null);
});


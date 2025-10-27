import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import type { CourseBundle } from '../../../shared/arhud/bundle_client';
import { __test__ } from '../../../shared/caddie/strategy';

const { buildFrame, prepareFeatures } = __test__;

const ORIGIN = { lat: 37.7749, lon: -122.4194 };
const EARTH_RADIUS_M = 6_378_137;

function toLatLon(x: number, y: number): { lat: number; lon: number } {
  const latOffset = (y / EARTH_RADIUS_M) * (180 / Math.PI);
  const lonOffset =
    (x / (EARTH_RADIUS_M * Math.cos((ORIGIN.lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: ORIGIN.lat + latOffset, lon: ORIGIN.lon + lonOffset };
}

function ringFromLocal(points: Array<{ x: number; y: number }>): number[][] {
  return points.map(({ x, y }) => {
    const geo = toLatLon(x, y);
    return [geo.lon, geo.lat];
  });
}

test('prepareFeatures collects polygons and cart paths via properties-based type detection', () => {
  const frame = buildFrame(ORIGIN, toLatLon(0, 250));
  assert.ok(frame, 'expected a valid frame');

  const fairwayRing = ringFromLocal([
    { x: -35, y: 0 },
    { x: 35, y: 0 },
    { x: 35, y: 220 },
    { x: -35, y: 220 },
    { x: -35, y: 0 },
  ]);
  const greenRing = ringFromLocal([
    { x: -20, y: 260 },
    { x: 20, y: 260 },
    { x: 20, y: 310 },
    { x: -20, y: 310 },
    { x: -20, y: 260 },
  ]);
  const bunkerRing = ringFromLocal([
    { x: 40, y: 140 },
    { x: 70, y: 140 },
    { x: 70, y: 180 },
    { x: 40, y: 180 },
    { x: 40, y: 140 },
  ]);
  const waterRing = ringFromLocal([
    { x: -80, y: 90 },
    { x: -50, y: 90 },
    { x: -50, y: 130 },
    { x: -80, y: 130 },
    { x: -80, y: 90 },
  ]);

  const bundle: CourseBundle = {
    courseId: 'synthetic-features',
    version: 1,
    ttlSec: 300,
    features: [
      {
        type: 'Feature',
        properties: { type: 'fairway' },
        geometry: { type: 'Polygon', coordinates: [fairwayRing] },
      },
      {
        type: 'Feature',
        properties: { kind: 'green' },
        geometry: { type: 'Polygon', coordinates: [greenRing] },
      },
      {
        type: 'Feature',
        properties: { category: 'sand_trap' },
        geometry: { type: 'Polygon', coordinates: [bunkerRing] },
      },
      {
        type: 'Feature',
        properties: { type: 'penalty_area' },
        geometry: { type: 'Polygon', coordinates: [waterRing] },
      },
      {
        type: 'Feature',
        properties: { type: 'cart_path' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [ORIGIN.lon - 0.0004, ORIGIN.lat + 0.001],
            [ORIGIN.lon - 0.0002, ORIGIN.lat + 0.0015],
            [ORIGIN.lon, ORIGIN.lat + 0.002],
          ],
        },
      },
      {
        type: 'bunker',
        geometry: {
          type: 'LineString',
          coordinates: [
            [ORIGIN.lon + 0.0002, ORIGIN.lat + 0.001],
            [ORIGIN.lon + 0.0004, ORIGIN.lat + 0.0014],
          ],
        },
      },
    ],
    greensById: {},
  };

  const prepared = prepareFeatures(bundle, frame);

  assert.ok(prepared.fairways.length > 0, 'fairway polygons should be captured');
  assert.ok(prepared.greens.length > 0, 'green polygons should be captured');
  const polygonHazards = prepared.hazards.filter((feature) => feature.kind === 'polygon');
  assert.ok(polygonHazards.length >= 2, 'hazard polygons should be collected');
  assert.ok(
    prepared.hazards.every((feature) => feature.kind === 'polygon'),
    'hazards should only contain polygon features',
  );
  assert.ok(prepared.cartpaths.length > 0, 'cart paths should be recorded separately');
});

test('prepareFeatures ignores non-cartpath lines for hazards', () => {
  const frame = buildFrame(ORIGIN, toLatLon(0, 200));
  assert.ok(frame, 'expected a valid frame');

  const bunkerRing = ringFromLocal([
    { x: 10, y: 40 },
    { x: 40, y: 40 },
    { x: 40, y: 80 },
    { x: 10, y: 80 },
    { x: 10, y: 40 },
  ]);
  const fairwayRing = ringFromLocal([
    { x: -30, y: -20 },
    { x: 30, y: -20 },
    { x: 30, y: 120 },
    { x: -30, y: 120 },
    { x: -30, y: -20 },
  ]);

  const bundle: CourseBundle = {
    courseId: 'line-gating',
    version: 1,
    ttlSec: 60,
    features: [
      {
        type: 'Feature',
        properties: { type: 'bunker' },
        geometry: { type: 'Polygon', coordinates: [bunkerRing] },
      },
      {
        type: 'Feature',
        properties: { type: 'fairway' },
        geometry: { type: 'Polygon', coordinates: [fairwayRing] },
      },
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [ORIGIN.lon + 0.0001, ORIGIN.lat + 0.0001],
            [ORIGIN.lon + 0.0002, ORIGIN.lat + 0.0002],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { type: 'cartpath' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [ORIGIN.lon - 0.0001, ORIGIN.lat - 0.0001],
            [ORIGIN.lon - 0.0003, ORIGIN.lat - 0.0002],
          ],
        },
      },
    ],
    greensById: {},
  };

  const prepared = prepareFeatures(bundle, frame);

  assert.strictEqual(prepared.hazards.length, 1, 'only polygon hazard should be recorded');
  assert.ok(
    prepared.hazards.every((feature) => feature.kind === 'polygon'),
    'hazards should not contain polyline entries',
  );
  assert.ok(
    !JSON.stringify(prepared.hazards).includes('LineString'),
    'hazard payload must omit LineString geometries',
  );
  assert.ok(prepared.cartpaths.length === 1, 'cartpath line should be captured exactly once');
});

function findFirstCoordinate(feature: any): [number, number] | null {
  const geometry = feature?.geometry;
  if (!geometry || typeof geometry.type !== 'string') {
    return null;
  }
  const type = geometry.type.toLowerCase();
  const coords = geometry.coordinates;
  if (!coords) {
    return null;
  }
  if (type === 'polygon' && Array.isArray(coords) && coords.length && Array.isArray(coords[0]) && coords[0].length) {
    const first = coords[0][0];
    if (Array.isArray(first) && first.length >= 2) {
      return [Number(first[0]), Number(first[1])];
    }
  }
  if (type === 'multipolygon' && Array.isArray(coords)) {
    for (const poly of coords) {
      if (!Array.isArray(poly) || !poly.length || !Array.isArray(poly[0]) || !poly[0].length) {
        continue;
      }
      const first = poly[0][0];
      if (Array.isArray(first) && first.length >= 2) {
        return [Number(first[0]), Number(first[1])];
      }
    }
  }
  if ((type === 'linestring' || type === 'multilinestring') && Array.isArray(coords) && coords.length) {
    const first = Array.isArray(coords[0]) ? coords[0] : null;
    if (first && Array.isArray(first) && first.length >= 2 && typeof first[0] === 'number' && typeof first[1] === 'number') {
      return [first[0], first[1]];
    }
  }
  return null;
}

test('demo course bundles expose fairways and hazards when available', async (t) => {
  const coursesDir = path.resolve(process.cwd(), 'data/courses');
  let entries: string[];
  try {
    entries = await fs.readdir(coursesDir);
  } catch (error) {
    t.skip('demo course directory missing');
    return;
  }
  const demoFiles = entries.filter((file) => file.startsWith('demo_') && file.endsWith('.json'));
  if (!demoFiles.length) {
    t.skip('no demo bundles found');
    return;
  }
  let checked = 0;
  for (const file of demoFiles) {
    const payload = await fs.readFile(path.join(coursesDir, file), 'utf8');
    const bundle = JSON.parse(payload) as CourseBundle;
    if (!Array.isArray(bundle.features) || bundle.features.length === 0) {
      continue;
    }
    const firstCoordinate = findFirstCoordinate(bundle.features[0]);
    if (!firstCoordinate) {
      continue;
    }
    const tee = { lat: firstCoordinate[1], lon: firstCoordinate[0] };
    const pin = { lat: tee.lat + 0.0005, lon: tee.lon };
    const frame = buildFrame(tee, pin);
    if (!frame) {
      continue;
    }
    const prepared = prepareFeatures(bundle, frame);
    assert.ok(prepared.fairways.length > 0, `${bundle.courseId} should expose fairways`);
    assert.ok(prepared.hazards.length > 0, `${bundle.courseId} should expose hazards`);
    checked += 1;
  }
  if (checked === 0) {
    t.skip('demo bundles missing usable geometry');
  }
});

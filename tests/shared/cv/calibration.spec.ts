import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyHomography,
  computeHomography,
  createSnapshot,
  getCalibrationHealth,
  isHomographySnapshotStale,
  loadHomographySnapshot,
  saveHomographySnapshot,
  __setCalibrationStorageForTests,
  type HomographyMatrix,
  type HomographySnapshot,
} from '../../../shared/cv/calibration';

type AsyncStorageMock = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const storageState = new Map<string, string>();

const storageMock: AsyncStorageMock = {
  getItem: async (key) => storageState.get(key) ?? null,
  setItem: async (key, value) => {
    storageState.set(key, value);
  },
  removeItem: async (key) => {
    storageState.delete(key);
  },
};

__setCalibrationStorageForTests(storageMock);

test.beforeEach(() => {
  storageState.clear();
});

function invertHomography(matrix: HomographyMatrix): HomographyMatrix {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const det =
    a * (e * i - f * h) -
    b * (d * i - f * g) +
    c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) {
    throw new Error('Matrix not invertible');
  }
  const invDet = 1 / det;
  return [
    (e * i - f * h) * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * i) * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet,
  ];
}

test('computeHomography maps vertical baseline into metres', () => {
  const computation = computeHomography(
    { x: 180, y: 640 },
    { x: 180, y: 260 },
    1.4,
    5.6,
  );
  const worldA = applyHomography(computation.matrix, { x: 180, y: 640 });
  const EPS = 1e-3;
  assert.ok(Math.abs(worldA.x) < EPS);
  assert.ok(Math.abs(worldA.y - 1.4) < EPS);
  const worldB = applyHomography(computation.matrix, { x: 180, y: 260 });
  assert.ok(Math.abs(worldB.x) < EPS);
  assert.ok(Math.abs(worldB.y - 5.6) < EPS);
  const mid = applyHomography(computation.matrix, { x: 200, y: 450 });
  assert.ok(Number.isFinite(mid.x));
  assert.ok(mid.y > 1.4 && mid.y < 5.6);
});

test('computeHomography handles rotated baselines and round-trips', () => {
  const pointA = { x: 60, y: 520 };
  const pointB = { x: 280, y: 300 };
  const computation = computeHomography(pointA, pointB, 2.1, 6.5);
  const worldA = applyHomography(computation.matrix, pointA);
  const worldB = applyHomography(computation.matrix, pointB);
  assert.ok(Math.abs(worldA.x) < 1e-6);
  assert.ok(Math.abs(worldA.y - 2.1) < 1e-6);
  assert.ok(Math.abs(worldB.x) < 1e-6);
  assert.ok(Math.abs(worldB.y - 6.5) < 1e-6);
  const midPixel = { x: 180, y: 410 };
  const midWorld = applyHomography(computation.matrix, midPixel);
  const inverse = invertHomography(computation.matrix);
  const projected = applyHomography(inverse, midWorld);
  assert.ok(Math.abs(projected.x - midPixel.x) < 1e-6);
  assert.ok(Math.abs(projected.y - midPixel.y) < 1e-6);
});

test('calibration health buckets and staleness heuristics', () => {
  const base = computeHomography({ x: 160, y: 620 }, { x: 160, y: 260 }, 2, 6);
  const snapshot = createSnapshot(base, Date.now());
  assert.equal(getCalibrationHealth(snapshot), 'good');
  const okSnapshot: HomographySnapshot = {
    ...snapshot,
    baselineMeters: 1.5,
    baselineAngleDeg: 40,
  };
  assert.equal(getCalibrationHealth(okSnapshot), 'ok');
  const poorSnapshot: HomographySnapshot = {
    ...snapshot,
    baselineMeters: 0.2,
  };
  assert.equal(getCalibrationHealth(poorSnapshot), 'poor');
  const stale = createSnapshot(base, Date.now() - 15 * 24 * 60 * 60 * 1_000);
  assert.equal(isHomographySnapshotStale(stale), true);
  assert.equal(isHomographySnapshotStale(snapshot), false);
});

test('save and load round-trip the snapshot payload', async () => {
  const computation = computeHomography({ x: 140, y: 600 }, { x: 140, y: 200 }, 1.8, 5.2);
  const snapshot = createSnapshot(computation, 42_000);
  await saveHomographySnapshot(snapshot);
  const loaded = await loadHomographySnapshot();
  assert.ok(loaded, 'expected snapshot to load');
  assert.equal(loaded?.computedAt, 42_000);
  assert.ok(Math.abs((loaded?.baselineMeters ?? 0) - computation.baselineMeters) < 1e-6);
  assert.ok(Math.abs((loaded?.baselineAngleDeg ?? 0) - computation.baselineAngleDeg) < 1e-6);
});

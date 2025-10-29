export type PixelPoint = { x: number; y: number };

type Awaitable<T> = T | Promise<T>;

export type HomographyMatrix = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type HomographyComputation = {
  matrix: HomographyMatrix;
  baselineMeters: number;
  baselineAngleDeg: number;
  metersA: number;
  metersB: number;
  pointA: PixelPoint;
  pointB: PixelPoint;
  baselinePixels: number;
};

export type HomographySnapshot = HomographyComputation & { computedAt: number };

export type CalibrationHealth = 'good' | 'ok' | 'poor';

type AsyncStorageLike = {
  getItem?: (key: string) => Awaitable<string | null>;
  setItem?: (key: string, value: string) => Awaitable<void>;
  removeItem?: (key: string) => Awaitable<void>;
};

const STORAGE_KEY = 'cv.homography.v1';
export const MAX_SNAPSHOT_AGE_MS = 14 * 24 * 60 * 60 * 1_000;
const MIN_PIXEL_BASELINE = 12;
const MIN_METER_DELTA = 0.05;
const EPSILON = 1e-9;

const fallbackStorage: AsyncStorageLike = (() => {
  const store = new Map<string, string>();
  return {
    getItem: async (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: async (key: string) => {
      store.delete(key);
    },
  } satisfies AsyncStorageLike;
})();

let storageOverride: AsyncStorageLike | null = null;
let storagePromise: Promise<AsyncStorageLike> | null = null;

function multiply3x3(a: HomographyMatrix, b: HomographyMatrix): HomographyMatrix {
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = a;
  const [b00, b01, b02, b10, b11, b12, b20, b21, b22] = b;
  return [
    a00 * b00 + a01 * b10 + a02 * b20,
    a00 * b01 + a01 * b11 + a02 * b21,
    a00 * b02 + a01 * b12 + a02 * b22,
    a10 * b00 + a11 * b10 + a12 * b20,
    a10 * b01 + a11 * b11 + a12 * b21,
    a10 * b02 + a11 * b12 + a12 * b22,
    a20 * b00 + a21 * b10 + a22 * b20,
    a20 * b01 + a21 * b11 + a22 * b21,
    a20 * b02 + a21 * b12 + a22 * b22,
  ];
}

function validatePoint(point: PixelPoint, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`${label} must have finite coordinates.`);
  }
}

function parseDistance(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive distance in meters.`);
  }
  return value;
}

function buildTranslation(dx: number, dy: number): HomographyMatrix {
  return [1, 0, dx, 0, 1, dy, 0, 0, 1];
}

function buildRotationToVertical(dx: number, dy: number): HomographyMatrix {
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
  const ux = dx / length;
  const uy = dy / length;
  return [uy, -ux, 0, ux, uy, 0, 0, 0, 1];
}

function buildScale(scaleX: number, scaleY: number): HomographyMatrix {
  return [scaleX, 0, 0, 0, scaleY, 0, 0, 0, 1];
}

async function loadStorage(): Promise<AsyncStorageLike> {
  if (storageOverride) {
    return storageOverride;
  }
  if (storagePromise) {
    return storagePromise;
  }
  storagePromise = (async () => {
    try {
      const mod = await import('@react-native-async-storage/async-storage');
      const candidate = 'default' in mod ? (mod.default as AsyncStorageLike) : (mod as AsyncStorageLike);
      const getItem = candidate?.getItem?.bind(candidate);
      const setItem = candidate?.setItem?.bind(candidate);
      const removeItem = candidate?.removeItem?.bind(candidate);
      if (getItem && setItem) {
        return { getItem, setItem, removeItem } satisfies AsyncStorageLike;
      }
    } catch {
      // ignore
    }
    return fallbackStorage;
  })();
  return storagePromise;
}

export function computeHomography(
  pointA: PixelPoint,
  pointB: PixelPoint,
  metersA: number,
  metersB: number,
): HomographyComputation {
  validatePoint(pointA, 'Point A');
  validatePoint(pointB, 'Point B');
  const distA = parseDistance(metersA, 'Point A distance');
  const distB = parseDistance(metersB, 'Point B distance');
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;
  const baselinePixels = Math.hypot(dx, dy);
  if (baselinePixels < MIN_PIXEL_BASELINE) {
    throw new Error('Select calibration points that are separated in the frame.');
  }
  const baselineMeters = distB - distA;
  if (!Number.isFinite(baselineMeters) || Math.abs(baselineMeters) < MIN_METER_DELTA) {
    throw new Error('Distances must differ by at least 5 cm.');
  }
  const translation = buildTranslation(-pointA.x, -pointA.y);
  const rotation = buildRotationToVertical(dx, dy);
  const scaleY = baselineMeters / baselinePixels;
  const scaleMagnitude = Math.max(Math.abs(scaleY), 1e-4);
  const scale = buildScale(scaleMagnitude, scaleY);
  const offset = buildTranslation(0, distA);
  const matrix = multiply3x3(offset, multiply3x3(scale, multiply3x3(rotation, translation)));
  const baselineAngleRad = Math.atan2(-(dy), dx);
  const baselineAngleDeg = (baselineAngleRad * 180) / Math.PI;
  return {
    matrix,
    baselineMeters,
    baselineAngleDeg,
    metersA: distA,
    metersB: distB,
    pointA: { ...pointA },
    pointB: { ...pointB },
    baselinePixels,
  };
}

export function applyHomography(matrix: HomographyMatrix, point: PixelPoint): PixelPoint {
  const px = point.x;
  const py = point.y;
  const denom = matrix[6] * px + matrix[7] * py + matrix[8];
  if (Math.abs(denom) < EPSILON) {
    return { x: Number.NaN, y: Number.NaN };
  }
  const x = (matrix[0] * px + matrix[1] * py + matrix[2]) / denom;
  const y = (matrix[3] * px + matrix[4] * py + matrix[5]) / denom;
  return { x, y };
}

export function getCalibrationHealth(
  snapshot: HomographySnapshot | HomographyComputation | null,
): CalibrationHealth {
  if (!snapshot) {
    return 'poor';
  }
  const baseline = Math.abs(snapshot.baselineMeters);
  if (!Number.isFinite(baseline) || baseline < MIN_METER_DELTA) {
    return 'poor';
  }
  const angle = snapshot.baselineAngleDeg;
  const distanceFromVertical = Math.min(
    Math.abs(angle - 90),
    Math.abs(angle + 90),
    Math.abs(angle - 270),
  );
  if (baseline >= 3 && distanceFromVertical <= 15) {
    return 'good';
  }
  if (baseline < 0.75 || distanceFromVertical > 50) {
    return 'poor';
  }
  return 'ok';
}

export function isHomographySnapshotStale(
  snapshot: HomographySnapshot,
  now: number = Date.now(),
  maxAgeMs: number = MAX_SNAPSHOT_AGE_MS,
): boolean {
  return now - snapshot.computedAt > maxAgeMs;
}

export async function saveHomographySnapshot(snapshot: HomographySnapshot): Promise<void> {
  const storage = await loadStorage();
  if (!storage.setItem) {
    return;
  }
  const payload = JSON.stringify(snapshot);
  await storage.setItem(STORAGE_KEY, payload);
}

export async function loadHomographySnapshot(): Promise<HomographySnapshot | null> {
  const storage = await loadStorage();
  const raw = storage.getItem ? await storage.getItem(STORAGE_KEY) : null;
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<HomographySnapshot>;
    if (!parsed || !Array.isArray(parsed.matrix) || parsed.matrix.length !== 9) {
      return null;
    }
    const matrix = parsed.matrix.map((value) => Number(value)) as number[];
    if (matrix.some((value) => !Number.isFinite(value))) {
      return null;
    }
    return {
      ...parsed,
      matrix: matrix as HomographyMatrix,
      baselineMeters: Number(parsed.baselineMeters ?? 0),
      baselineAngleDeg: Number(parsed.baselineAngleDeg ?? 0),
      metersA: Number(parsed.metersA ?? 0),
      metersB: Number(parsed.metersB ?? 0),
      pointA: parsed.pointA ?? { x: 0, y: 0 },
      pointB: parsed.pointB ?? { x: 0, y: 0 },
      baselinePixels: Number(parsed.baselinePixels ?? 0),
      computedAt: Number(parsed.computedAt ?? 0),
    } satisfies HomographySnapshot;
  } catch {
    return null;
  }
}

export async function clearHomographySnapshot(): Promise<void> {
  const storage = await loadStorage();
  if (storage.removeItem) {
    await storage.removeItem(STORAGE_KEY);
  }
}

export function createSnapshot(
  computation: HomographyComputation,
  computedAt: number = Date.now(),
): HomographySnapshot {
  return {
    ...computation,
    computedAt,
  };
}

export function __setCalibrationStorageForTests(storage: AsyncStorageLike | null): void {
  storageOverride = storage;
  storagePromise = storage ? Promise.resolve(storage) : null;
}

export { STORAGE_KEY as CALIBRATION_STORAGE_KEY };

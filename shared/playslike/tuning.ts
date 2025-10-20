const DEFAULT_REF_TEMP_C = 20;
const STORAGE_KEY = "playslike.tuning.coeffs.v1";
const RC_FLAG_KEY = "playsLike.tuning.enabled";
const DEFAULT_LAMBDA = 0.1;
const MAX_FULL_WEIGHT_SAMPLES = 100;
const EPSILON = 1e-9;

export interface ShotObservation {
  baseDistance_m: number;
  actual_carry_m: number;
  playsLike_base_m?: number | null;
  temperatureC?: number | null;
  altitude_m?: number | null;
  wind_mps?: number | null;
  wind_from_deg?: number | null;
  target_azimuth_deg?: number | null;
  slope_dh_m?: number | null;
}

export interface PersonalCoefficients {
  betaPerC: number;
  gammaPer100m: number;
  head_per_mps: number;
  slope_per_m: number;
}

export interface TuningSnapshot extends PersonalCoefficients {
  samples: number;
  alpha: number;
  updatedAt: number;
}

export const DEFAULT_COEFFS: PersonalCoefficients = Object.freeze({
  betaPerC: 0.0018,
  gammaPer100m: 0.0065,
  head_per_mps: 0.015,
  slope_per_m: 0.9,
});

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

type StoredPayload = {
  version?: number;
  coeffs: PersonalCoefficients;
  samples: number;
  alpha: number;
  updatedAt: number;
};

const fallbackStorage: AsyncStorageLike = (() => {
  const store = new Map<string, string>();
  return {
    async getItem(key: string): Promise<string | null> {
      return store.has(key) ? store.get(key)! : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      store.delete(key);
    },
  };
})();

let storageOverride: AsyncStorageLike | null = null;
let storagePromise: Promise<AsyncStorageLike> | null = null;
let tunedSnapshotCache: StoredPayload | null | undefined;
let hydrationTask: Promise<void> | null = null;
let tuningEnabledOverride: boolean | null = null;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeNumber(value: unknown, fallback: number): number {
  if (isFiniteNumber(value)) {
    return Number(value);
  }
  return fallback;
}

function sanitizeAngle(value: unknown): number | null {
  if (!isFiniteNumber(value)) {
    return null;
  }
  const normalized = Number(value) % 360;
  if (!Number.isFinite(normalized)) {
    return null;
  }
  return normalized;
}

function sanitizeDistance(value: unknown): number {
  if (!isFiniteNumber(value)) {
    return 0;
  }
  const numeric = Number(value);
  return numeric > 0 ? numeric : 0;
}

function loadGlobalRc(): Record<string, unknown> | null {
  if (typeof globalThis === "undefined" || !globalThis) {
    return null;
  }
  const candidate = (globalThis as Record<string, unknown> & { RC?: unknown }).RC;
  if (candidate && typeof candidate === "object") {
    return candidate as Record<string, unknown>;
  }
  return null;
}

function normalizeBoolean(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return ["1", "true", "yes", "on"].includes(normalized);
  }
  return false;
}

function blendCoefficients(
  base: PersonalCoefficients,
  target: PersonalCoefficients,
  alpha: number,
): PersonalCoefficients {
  const weight = Math.min(1, Math.max(0, alpha));
  const complement = 1 - weight;
  return {
    betaPerC: complement * base.betaPerC + weight * target.betaPerC,
    gammaPer100m: complement * base.gammaPer100m + weight * target.gammaPer100m,
    head_per_mps: complement * base.head_per_mps + weight * target.head_per_mps,
    slope_per_m: complement * base.slope_per_m + weight * target.slope_per_m,
  };
}

function normalizeCoefficients(input: unknown): PersonalCoefficients {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_COEFFS };
  }
  const source = input as Record<string, unknown>;
  const beta = sanitizeNumber(source.betaPerC, DEFAULT_COEFFS.betaPerC);
  const gamma = sanitizeNumber(source.gammaPer100m, DEFAULT_COEFFS.gammaPer100m);
  const head = sanitizeNumber(source.head_per_mps, DEFAULT_COEFFS.head_per_mps);
  const slope = sanitizeNumber(source.slope_per_m, DEFAULT_COEFFS.slope_per_m);
  return {
    betaPerC: beta,
    gammaPer100m: gamma,
    head_per_mps: head,
    slope_per_m: slope,
  };
}

function normalizeSnapshot(input: unknown): StoredPayload | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const candidate = input as Record<string, unknown>;
  const coeffs = normalizeCoefficients(candidate.coeffs);
  const samplesRaw = candidate.samples;
  const alphaRaw = candidate.alpha;
  const updatedAtRaw = candidate.updatedAt;
  const samples = Math.max(0, Math.floor(sanitizeNumber(samplesRaw, 0)));
  const alpha = Math.min(1, Math.max(0, sanitizeNumber(alphaRaw, 0)));
  const updatedAt = Math.max(0, Math.floor(sanitizeNumber(updatedAtRaw, Date.now())));
  return {
    coeffs,
    samples,
    alpha,
    updatedAt,
  };
}

async function loadStorage(): Promise<AsyncStorageLike> {
  if (storageOverride) {
    return storageOverride;
  }
  if (storagePromise) {
    return storagePromise;
  }
  storagePromise = import("@react-native-async-storage/async-storage")
    .then((mod) => {
      const resolved =
        mod && typeof mod === "object" && "default" in mod
          ? (mod.default as AsyncStorageLike)
          : (mod as AsyncStorageLike);
      if (
        resolved &&
        typeof resolved.getItem === "function" &&
        typeof resolved.setItem === "function"
      ) {
        return resolved;
      }
      return fallbackStorage;
    })
    .catch(() => fallbackStorage);
  return storagePromise;
}

async function readStoredSnapshot(): Promise<StoredPayload | null> {
  try {
    const storage = await loadStorage();
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeSnapshot(parsed);
    return normalized;
  } catch (error) {
    return null;
  }
}

async function persistSnapshot(snapshot: StoredPayload | null): Promise<void> {
  try {
    const storage = await loadStorage();
    if (!snapshot) {
      if (typeof storage.removeItem === "function") {
        await storage.removeItem(STORAGE_KEY);
      } else {
        await storage.setItem(STORAGE_KEY, "");
      }
      return;
    }
    const payload: StoredPayload & { version: number } = {
      version: 1,
      coeffs: snapshot.coeffs,
      samples: snapshot.samples,
      alpha: snapshot.alpha,
      updatedAt: snapshot.updatedAt,
    };
    await storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    // ignore persistence issues for QA builds
  }
}

function ensureHydrated(): void {
  if (tunedSnapshotCache !== undefined || hydrationTask) {
    return;
  }
  hydrationTask = readStoredSnapshot()
    .then((snapshot) => {
      tunedSnapshotCache = snapshot;
    })
    .catch(() => {
      tunedSnapshotCache = null;
    })
    .finally(() => {
      hydrationTask = null;
    });
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function computeFeatureRow(
  shot: ShotObservation,
): { features: [number, number, number, number]; base: number } | null {
  const baseDistance = sanitizeDistance(shot.baseDistance_m);
  if (baseDistance <= 0) {
    return null;
  }
  const temperatureC = sanitizeNumber(shot.temperatureC, DEFAULT_REF_TEMP_C);
  const altitudeM = sanitizeNumber(shot.altitude_m, 0);
  const windSpeed = Math.max(0, sanitizeNumber(shot.wind_mps, 0));
  const windDirection = sanitizeAngle(shot.wind_from_deg);
  const targetAzimuth = sanitizeAngle(shot.target_azimuth_deg) ?? 0;
  const slopeDh = sanitizeNumber(shot.slope_dh_m, 0);

  const diffC = DEFAULT_REF_TEMP_C - temperatureC;
  const tempFeature = baseDistance * diffC;

  const altFeature = baseDistance * (altitudeM / 100);

  let headFeature = 0;
  if (windSpeed > 0 && windDirection !== null) {
    const thetaDeg = windDirection - targetAzimuth;
    const thetaRad = toRadians(thetaDeg);
    const headComponent = windSpeed * Math.cos(thetaRad);
    headFeature = -baseDistance * headComponent;
  }

  const slopeFeature = -slopeDh;

  const features: [number, number, number, number] = [
    tempFeature,
    altFeature,
    headFeature,
    slopeFeature,
  ];

  const hasSignal = features.some((value) => Math.abs(value) > EPSILON);
  if (!hasSignal) {
    return null;
  }

  const basePlaysLike = isFiniteNumber(shot.playsLike_base_m)
    ? Number(shot.playsLike_base_m)
    : baseDistance +
      DEFAULT_COEFFS.betaPerC * tempFeature +
      DEFAULT_COEFFS.gammaPer100m * altFeature +
      DEFAULT_COEFFS.head_per_mps * headFeature +
      DEFAULT_COEFFS.slope_per_m * slopeFeature;

  return { features, base: basePlaysLike };
}

function ridgeRegression(
  features: Array<[number, number, number, number]>,
  targets: number[],
  lambda: number,
): [number, number, number, number] {
  const dim = 4;
  const xtx: number[][] = Array.from({ length: dim }, () => Array(dim).fill(0));
  const xty: number[] = Array(dim).fill(0);

  for (let rowIdx = 0; rowIdx < features.length; rowIdx += 1) {
    const row = features[rowIdx];
    const target = targets[rowIdx];
    for (let i = 0; i < dim; i += 1) {
      const xi = row[i];
      xty[i] += xi * target;
      for (let j = 0; j < dim; j += 1) {
        xtx[i][j] += xi * row[j];
      }
    }
  }

  for (let i = 0; i < dim; i += 1) {
    xtx[i][i] += lambda;
  }

  const augmented: number[][] = xtx.map((row, idx) => [...row, xty[idx]]);

  for (let col = 0; col < dim; col += 1) {
    let pivot = col;
    let maxAbs = Math.abs(augmented[col][col]);
    for (let row = col + 1; row < dim; row += 1) {
      const candidate = Math.abs(augmented[row][col]);
      if (candidate > maxAbs) {
        maxAbs = candidate;
        pivot = row;
      }
    }
    if (maxAbs < EPSILON) {
      continue;
    }
    if (pivot !== col) {
      const tmp = augmented[col];
      augmented[col] = augmented[pivot];
      augmented[pivot] = tmp;
    }
    const pivotValue = augmented[col][col];
    if (Math.abs(pivotValue) < EPSILON) {
      continue;
    }
    for (let j = col; j <= dim; j += 1) {
      augmented[col][j] /= pivotValue;
    }
    for (let row = 0; row < dim; row += 1) {
      if (row === col) {
        continue;
      }
      const factor = augmented[row][col];
      if (Math.abs(factor) < EPSILON) {
        continue;
      }
      for (let j = col; j <= dim; j += 1) {
        augmented[row][j] -= factor * augmented[col][j];
      }
    }
  }

  const solution: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < dim; i += 1) {
    const value = augmented[i][dim];
    solution[i] = Number.isFinite(value) ? value : 0;
  }
  return solution;
}

export function isTuningEnabled(): boolean {
  if (tuningEnabledOverride !== null) {
    return tuningEnabledOverride;
  }
  const rc = loadGlobalRc();
  if (!rc) {
    return false;
  }
  return normalizeBoolean(rc[RC_FLAG_KEY]);
}

export function getTunedCoeffs(): PersonalCoefficients | null {
  ensureHydrated();
  if (!tunedSnapshotCache) {
    return null;
  }
  return { ...tunedSnapshotCache.coeffs };
}

export function getTuningSnapshot(): TuningSnapshot | null {
  ensureHydrated();
  if (!tunedSnapshotCache) {
    return null;
  }
  return {
    ...tunedSnapshotCache.coeffs,
    samples: tunedSnapshotCache.samples,
    alpha: tunedSnapshotCache.alpha,
    updatedAt: tunedSnapshotCache.updatedAt,
  };
}

export async function hydrateTunedCoeffs(): Promise<PersonalCoefficients | null> {
  const snapshot = await readStoredSnapshot();
  tunedSnapshotCache = snapshot;
  return snapshot ? { ...snapshot.coeffs } : null;
}

export async function clearTunedCoeffs(): Promise<void> {
  tunedSnapshotCache = null;
  await persistSnapshot(null);
}

export async function learnPersonalCoefficients(
  shots: ShotObservation[],
  options: { lambda?: number } = {},
): Promise<TuningSnapshot | null> {
  const lambda = options.lambda ?? DEFAULT_LAMBDA;
  const featureRows: Array<[number, number, number, number]> = [];
  const targets: number[] = [];

  for (const shot of shots) {
    if (!shot || typeof shot !== "object") {
      continue;
    }
    const observation = computeFeatureRow(shot);
    if (!observation) {
      continue;
    }
    const actual = sanitizeNumber(shot.actual_carry_m, NaN);
    if (!Number.isFinite(actual)) {
      continue;
    }
    const err = actual - observation.base;
    if (!Number.isFinite(err)) {
      continue;
    }
    featureRows.push(observation.features);
    targets.push(err);
  }

  const n = featureRows.length;
  if (n === 0) {
    return null;
  }

  const deltas = ridgeRegression(featureRows, targets, lambda);
  const candidate: PersonalCoefficients = {
    betaPerC: DEFAULT_COEFFS.betaPerC + deltas[0],
    gammaPer100m: DEFAULT_COEFFS.gammaPer100m + deltas[1],
    head_per_mps: DEFAULT_COEFFS.head_per_mps + deltas[2],
    slope_per_m: DEFAULT_COEFFS.slope_per_m + deltas[3],
  };

  const alpha = Math.min(1, n / MAX_FULL_WEIGHT_SAMPLES);
  const blended = blendCoefficients(DEFAULT_COEFFS, candidate, alpha);
  const snapshot: StoredPayload = {
    coeffs: blended,
    samples: n,
    alpha,
    updatedAt: Date.now(),
  };
  tunedSnapshotCache = snapshot;
  await persistSnapshot(snapshot);
  return {
    ...snapshot.coeffs,
    samples: snapshot.samples,
    alpha: snapshot.alpha,
    updatedAt: snapshot.updatedAt,
  };
}

export function __setTuningStorageForTests(storage: AsyncStorageLike | null): void {
  storageOverride = storage;
  storagePromise = null;
}

export function __resetTuningCacheForTests(): void {
  tunedSnapshotCache = undefined;
  hydrationTask = null;
}

export function __setTuningEnabledOverrideForTests(value: boolean | null): void {
  tuningEnabledOverride = value;
}

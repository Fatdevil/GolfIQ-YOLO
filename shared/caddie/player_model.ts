import { CLUB_SEQUENCE, defaultBag, type Bag, type ClubId } from "../playslike/bag";
import type { ClubDispersion } from "./dispersion";

export interface ClubStats {
  carry_m: number;
  sigma_long_m: number;
  sigma_lat_m: number;
}

export interface PlayerModel {
  clubs: Record<ClubId, ClubStats>;
  tuningActive: boolean;
}

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

export type DispersionSnapshot = {
  updatedAt: number;
  clubs: Partial<Record<ClubId, ClubDispersion>>;
};

type BuildArgs = {
  bag: Bag;
  dispersion?: Partial<Record<ClubId, ClubDispersion>>;
  minSamples?: number;
};

const MIN_SIGMA_LONG = 6;
const MIN_SIGMA_LAT = 3;
const DEFAULT_LONG_FRACTION = 0.14;
const DEFAULT_LAT_FRACTION = 0.09;
const DISPERSION_STORAGE_KEY = "caddie.dispersion.v2";

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
  } satisfies AsyncStorageLike;
})();

type GlobalDispersionStorage = typeof globalThis & {
  __CADDIE_DISPERSION_STORAGE__?: AsyncStorageLike;
};

let storageOverride: AsyncStorageLike | null = null;
let storagePromise: Promise<AsyncStorageLike> | null = null;
let cachedDispersion: DispersionSnapshot | null | undefined;

const toFinite = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
};

const sanitizeDistance = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const numeric = Number(value);
  return numeric > 0 ? numeric : fallback;
};

const sanitizeSigma = (value: number | undefined, minimum: number, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const numeric = Number(value);
  if (numeric <= 0) {
    return minimum;
  }
  return Math.max(minimum, numeric);
};

function normalizeClubDispersion(value: unknown): ClubDispersion | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const sigmaLong = toFinite(record.sigma_long_m);
  const sigmaLat = toFinite(record.sigma_lat_m);
  const nRaw = toFinite(record.n);
  if (sigmaLong === null || sigmaLat === null || nRaw === null) {
    return null;
  }
  const n = Math.max(0, Math.floor(nRaw));
  if (n <= 0) {
    return null;
  }
  const normalized: ClubDispersion = {
    sigma_long_m: Math.max(0, sigmaLong),
    sigma_lat_m: Math.max(0, sigmaLat),
    n,
  };
  const updatedAtRaw = toFinite(record.updatedAt);
  if (updatedAtRaw && updatedAtRaw > 0) {
    normalized.updatedAt = updatedAtRaw;
  }
  return normalized;
}

function normalizeSnapshot(value: unknown): DispersionSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const clubsRaw = record.clubs;
  if (!clubsRaw || typeof clubsRaw !== "object") {
    return null;
  }
  const clubs: Partial<Record<ClubId, ClubDispersion>> = {};
  let count = 0;
  for (const club of CLUB_SEQUENCE) {
    const entry = normalizeClubDispersion((clubsRaw as Record<string, unknown>)[club]);
    if (entry) {
      clubs[club] = entry;
      count += 1;
    }
  }
  if (!count) {
    return null;
  }
  const timestamp = (() => {
    const parsed = toFinite(record.updatedAt);
    if (parsed && parsed > 0) {
      return parsed;
    }
    return Date.now();
  })();
  return {
    updatedAt: timestamp,
    clubs,
  };
}

function cloneSnapshot(snapshot: DispersionSnapshot): DispersionSnapshot {
  const clubs: Partial<Record<ClubId, ClubDispersion>> = {};
  for (const club of CLUB_SEQUENCE) {
    const entry = snapshot.clubs[club];
    if (entry) {
      clubs[club] = { ...entry };
    }
  }
  return {
    updatedAt: snapshot.updatedAt,
    clubs,
  };
}

function resolveStorageOverride(): AsyncStorageLike | null {
  if (storageOverride) {
    return storageOverride;
  }
  if (typeof globalThis === "undefined") {
    return null;
  }
  const holder = globalThis as GlobalDispersionStorage;
  const candidate = holder.__CADDIE_DISPERSION_STORAGE__;
  if (
    candidate &&
    typeof candidate.getItem === "function" &&
    typeof candidate.setItem === "function"
  ) {
    return candidate;
  }
  return null;
}

async function loadStorage(): Promise<AsyncStorageLike> {
  if (storagePromise) {
    return storagePromise;
  }
  const override = resolveStorageOverride();
  if (override) {
    storagePromise = Promise.resolve(override);
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

export function buildPlayerModel(args: BuildArgs): PlayerModel {
  const baseBag = defaultBag();
  const clubs: Partial<Record<ClubId, ClubStats>> = {};
  const minSamples = Math.max(1, args.minSamples ?? 6);
  let tuningActive = false;
  for (const club of CLUB_SEQUENCE) {
    const fallback = baseBag[club];
    const carry = sanitizeDistance(args.bag?.[club], fallback);
    if (carry !== fallback) {
      tuningActive = true;
    }
    const dispersion = args.dispersion?.[club];
    const useLearned = Boolean(
      dispersion &&
      Number.isFinite(dispersion.sigma_long_m) &&
      Number.isFinite(dispersion.sigma_lat_m) &&
      dispersion.n >= minSamples,
    );
    const sigmaLong = sanitizeSigma(
      useLearned ? dispersion?.sigma_long_m : undefined,
      MIN_SIGMA_LONG,
      Math.max(MIN_SIGMA_LONG, carry * DEFAULT_LONG_FRACTION),
    );
    const sigmaLat = sanitizeSigma(
      useLearned ? dispersion?.sigma_lat_m : undefined,
      MIN_SIGMA_LAT,
      Math.max(MIN_SIGMA_LAT, carry * DEFAULT_LAT_FRACTION),
    );
    if (useLearned) {
      tuningActive = true;
    }
    clubs[club] = {
      carry_m: carry,
      sigma_long_m: sigmaLong,
      sigma_lat_m: sigmaLat,
    };
  }
  return {
    clubs: clubs as Record<ClubId, ClubStats>,
    tuningActive,
  };
}

export async function loadLearnedDispersion(): Promise<DispersionSnapshot | null> {
  if (cachedDispersion !== undefined) {
    return cachedDispersion ? cloneSnapshot(cachedDispersion) : null;
  }
  try {
    const storage = await loadStorage();
    const raw = await storage.getItem(DISPERSION_STORAGE_KEY);
    if (!raw) {
      cachedDispersion = null;
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    const snapshot = normalizeSnapshot(parsed);
    cachedDispersion = snapshot;
    return snapshot ? cloneSnapshot(snapshot) : null;
  } catch (error) {
    cachedDispersion = null;
    return null;
  }
}

export async function loadDispersion(): Promise<Record<ClubId, ClubDispersion>> {
  const snapshot = await loadLearnedDispersion();
  if (!snapshot) {
    return {} as Record<ClubId, ClubDispersion>;
  }
  const clubs: Partial<Record<ClubId, ClubDispersion>> = {};
  for (const club of CLUB_SEQUENCE) {
    const entry = snapshot.clubs[club];
    if (entry) {
      clubs[club] = { ...entry };
    }
  }
  return clubs as Record<ClubId, ClubDispersion>;
}

export async function saveLearnedDispersion(
  clubs: Partial<Record<ClubId, ClubDispersion>>,
  updatedAt: number = Date.now(),
): Promise<void> {
  const sanitized: Partial<Record<ClubId, ClubDispersion>> = {};
  for (const club of CLUB_SEQUENCE) {
    const entry = normalizeClubDispersion(clubs?.[club]);
    if (entry) {
      sanitized[club] = entry;
    }
  }
  const snapshot = Object.keys(sanitized).length
    ? {
        updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now(),
        clubs: sanitized,
      }
    : null;
  cachedDispersion = snapshot ? cloneSnapshot(snapshot) : null;
  try {
    const storage = await loadStorage();
    if (snapshot) {
      await storage.setItem(DISPERSION_STORAGE_KEY, JSON.stringify(snapshot));
    } else if (typeof storage.removeItem === "function") {
      await storage.removeItem(DISPERSION_STORAGE_KEY);
    } else {
      await storage.setItem(DISPERSION_STORAGE_KEY, "");
    }
  } catch (error) {
    // ignore persistence errors in QA tooling
  }
}

export async function saveDispersion(clubs: Record<ClubId, ClubDispersion>): Promise<void> {
  await saveMergedDispersion(clubs, Date.now());
}

export async function saveMergedDispersion(
  incoming: Record<ClubId, ClubDispersion>,
  now = Date.now(),
): Promise<void> {
  const base = await loadDispersion().catch(() => ({} as Record<ClubId, ClubDispersion>));
  const out: Record<ClubId, ClubDispersion> = { ...base };

  for (const [club, inc] of Object.entries(incoming)) {
    const clubId = club as ClubId;
    if (!inc || !Number.isFinite(inc.sigma_long_m) || !Number.isFinite(inc.sigma_lat_m)) {
      continue;
    }
    const prev = base[clubId];
    const n1 = prev && Number.isFinite(prev.n) ? Math.max(0, prev.n) : 0;
    const n2 = Number.isFinite(inc.n) ? Math.max(0, inc.n) : 0;
    if (!prev || !Number.isFinite(prev.sigma_long_m) || !Number.isFinite(prev.sigma_lat_m) || n1 <= 0) {
      if (n2 > 0) {
        out[clubId] = { ...inc, updatedAt: now };
      }
      continue;
    }

    const denom = Math.max(1, n1 + n2);
    const wLong = Math.sqrt(
      (n1 * prev.sigma_long_m ** 2 + n2 * inc.sigma_long_m ** 2) / denom,
    );
    const wLat = Math.sqrt(
      (n1 * prev.sigma_lat_m ** 2 + n2 * inc.sigma_lat_m ** 2) / denom,
    );

    out[clubId] = {
      sigma_long_m: wLong,
      sigma_lat_m: wLat,
      n: n1 + n2,
      updatedAt: now,
    };
  }

  await saveLearnedDispersion(out, now);
}

export function __setDispersionStorageForTests(storage: AsyncStorageLike | null): void {
  storageOverride = storage;
  storagePromise = storage ? Promise.resolve(storage) : null;
  cachedDispersion = null;
  if (typeof globalThis !== "undefined") {
    const holder = globalThis as GlobalDispersionStorage;
    if (storage) {
      holder.__CADDIE_DISPERSION_STORAGE__ = storage;
    } else {
      delete holder.__CADDIE_DISPERSION_STORAGE__;
    }
  }
}

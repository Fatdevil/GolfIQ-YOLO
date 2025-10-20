export type ClubId =
  | "D"
  | "3W"
  | "5W"
  | "4i"
  | "5i"
  | "6i"
  | "7i"
  | "8i"
  | "9i"
  | "PW"
  | "GW"
  | "SW";

export type Bag = { [K in ClubId]: number };

const CLUB_SEQUENCE_ASC: readonly ClubId[] = [
  "SW",
  "GW",
  "PW",
  "9i",
  "8i",
  "7i",
  "6i",
  "5i",
  "4i",
  "5W",
  "3W",
  "D",
];

const sanitizeCarry = (value: number | undefined): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const numeric = Number(value);
  return numeric > 0 ? numeric : 0;
};

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

const STORAGE_KEY = "playslike.userBag.v1";

const fallbackStorage = (() => {
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

let storagePromise: Promise<AsyncStorageLike> | null = null;
let userBagCache: Bag | null | undefined;

async function loadStorage(): Promise<AsyncStorageLike> {
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

function cloneBag(bag: Bag): Bag {
  return { ...bag } as Bag;
}

function normalizeBag(value: unknown): Bag | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const defaults = defaultBag();
  const next: Partial<Bag> = {};
  let hasOverride = false;
  const input = value as Record<string, unknown>;
  for (const club of CLUB_SEQUENCE_ASC) {
    const candidate = sanitizeCarry(input[club] as number | undefined);
    if (candidate > 0) {
      next[club] = candidate;
      hasOverride = true;
    } else {
      next[club] = defaults[club];
    }
  }
  if (!hasOverride) {
    return null;
  }
  return next as Bag;
}

export const defaultBag = (): Bag => ({
  D: 235,
  "3W": 220,
  "5W": 205,
  "4i": 190,
  "5i": 180,
  "6i": 170,
  "7i": 155,
  "8i": 145,
  "9i": 135,
  PW: 120,
  GW: 105,
  SW: 90,
});

export const suggestClub = (bag: Bag, playsLike_m: number): ClubId => {
  const target = Number.isFinite(playsLike_m) ? Math.max(0, playsLike_m) : 0;
  let fallback: ClubId = CLUB_SEQUENCE_ASC[CLUB_SEQUENCE_ASC.length - 1];
  for (const club of CLUB_SEQUENCE_ASC) {
    const carry = sanitizeCarry(bag[club]);
    if (carry > 0) {
      fallback = club;
    }
    if (carry >= target && carry > 0) {
      return club;
    }
  }
  return fallback;
};

export const CLUB_SEQUENCE = CLUB_SEQUENCE_ASC;

export const effectiveBag = (): Bag => {
  if (userBagCache !== null && userBagCache !== undefined) {
    return cloneBag(userBagCache);
  }
  return defaultBag();
};

export async function getUserBag(): Promise<Bag | null> {
  if (userBagCache !== undefined) {
    return userBagCache;
  }
  try {
    const storage = await loadStorage();
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) {
      userBagCache = null;
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeBag(parsed);
    if (normalized) {
      userBagCache = normalized;
      return normalized;
    }
  } catch (error) {
    userBagCache = null;
    return null;
  }
  userBagCache = null;
  return null;
}

export async function saveUserBag(bag: Bag): Promise<void> {
  const normalized = normalizeBag(bag) ?? defaultBag();
  userBagCache = normalized;
  try {
    const storage = await loadStorage();
    await storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // ignore persistence issues in QA tooling
  }
}

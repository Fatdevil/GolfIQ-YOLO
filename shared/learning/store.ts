import type { LearningState, SuggestionMap } from "./types";

export type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const STORAGE_KEY = "caddie.learning.v1";
const VERSION = 1;

const fallbackStorage: AsyncStorageLike = (() => {
  if (typeof globalThis !== "undefined") {
    const holder = globalThis as { __CADDIE_LEARNING_STORAGE__?: AsyncStorageLike } & {
      localStorage?: {
        getItem(key: string): string | null;
        setItem(key: string, value: string): void;
        removeItem?(key: string): void;
      };
    };
    if (holder.__CADDIE_LEARNING_STORAGE__) {
      return holder.__CADDIE_LEARNING_STORAGE__;
    }
    if (
      holder.localStorage &&
      typeof holder.localStorage.getItem === "function" &&
      typeof holder.localStorage.setItem === "function"
    ) {
      return {
        async getItem(key: string): Promise<string | null> {
          try {
            return holder.localStorage?.getItem(key) ?? null;
          } catch {
            return null;
          }
        },
        async setItem(key: string, value: string): Promise<void> {
          holder.localStorage?.setItem(key, value);
        },
        async removeItem(key: string): Promise<void> {
          try {
            holder.localStorage?.removeItem?.(key);
          } catch {
            holder.localStorage?.setItem(key, "");
          }
        },
      } satisfies AsyncStorageLike;
    }
  }
  const memory = new Map<string, string>();
  return {
    async getItem(key: string): Promise<string | null> {
      return memory.has(key) ? memory.get(key)! : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      memory.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      memory.delete(key);
    },
  } satisfies AsyncStorageLike;
})();

let storagePromise: Promise<AsyncStorageLike> | null = null;

function resolveStorageOverride(): AsyncStorageLike | null {
  const holder = globalThis as { __CADDIE_LEARNING_STORAGE__?: AsyncStorageLike } | undefined;
  return holder?.__CADDIE_LEARNING_STORAGE__ ?? null;
}

async function loadStorage(): Promise<AsyncStorageLike> {
  if (storagePromise) {
    return storagePromise;
  }
  storagePromise = (async () => {
    const override = resolveStorageOverride();
    if (override) {
      return override;
    }
    if (typeof globalThis !== "undefined") {
      try {
        const mod = await import("@react-native-async-storage/async-storage");
        const candidate = (mod && typeof mod === "object" && "default" in mod
          ? (mod as { default: AsyncStorageLike }).default
          : (mod as AsyncStorageLike)) as AsyncStorageLike;
        if (
          candidate &&
          typeof candidate.getItem === "function" &&
          typeof candidate.setItem === "function" &&
          typeof candidate.removeItem === "function"
        ) {
          return candidate;
        }
      } catch {
        // ignore module resolution failures
      }
    }
    return fallbackStorage;
  })();
  return storagePromise;
}

const EMPTY_STATE: LearningState = {
  version: VERSION,
  suggestions: {},
};

function normalizeState(value: unknown): LearningState {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_STATE };
  }
  const version = (value as { version?: unknown }).version;
  if (version !== VERSION) {
    return { ...EMPTY_STATE };
  }
  const suggestionsRaw = (value as { suggestions?: unknown }).suggestions;
  if (!suggestionsRaw || typeof suggestionsRaw !== "object") {
    return { ...EMPTY_STATE };
  }
  const suggestions: SuggestionMap = {};
  for (const [profile, clubs] of Object.entries(suggestionsRaw)) {
    if (!clubs || typeof clubs !== "object") {
      continue;
    }
    const clubEntries: Record<string, any> = {};
    for (const [clubId, entry] of Object.entries(clubs)) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const hazardDelta = Number((entry as any).hazardDelta ?? 0);
      const distanceDelta = Number((entry as any).distanceDelta ?? 0);
      const delta = Number((entry as any).delta ?? 0);
      const acceptEma = Number((entry as any).acceptEma ?? 0);
      const successEma = Number((entry as any).successEma ?? 0);
      const target = Number((entry as any).target ?? 0.7);
      const sampleSize = Number((entry as any).sampleSize ?? 0);
      const updatedAt = Number((entry as any).updatedAt ?? Date.now());
      const snapshot = {
        clubId,
        profile: profile as any,
        hazardDelta: Number.isFinite(hazardDelta) ? hazardDelta : 0,
        distanceDelta: Number.isFinite(distanceDelta) ? distanceDelta : 0,
        delta: Number.isFinite(delta) ? delta : 0,
        acceptEma: Number.isFinite(acceptEma) ? acceptEma : 0,
        successEma: Number.isFinite(successEma) ? successEma : 0,
        target: Number.isFinite(target) ? target : 0.7,
        sampleSize: Number.isFinite(sampleSize) ? sampleSize : 0,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
      };
      clubEntries[clubId] = snapshot;
    }
    if (Object.keys(clubEntries).length > 0) {
      suggestions[profile as keyof SuggestionMap] = clubEntries;
    }
  }
  return {
    version: VERSION,
    suggestions,
  };
}

export async function getState(): Promise<LearningState> {
  const storage = await loadStorage();
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...EMPTY_STATE };
    }
    const parsed = JSON.parse(raw) as unknown;
    return normalizeState(parsed);
  } catch {
    return { ...EMPTY_STATE };
  }
}

export async function setState(
  updater: LearningState | ((prev: LearningState) => LearningState),
): Promise<void> {
  const storage = await loadStorage();
  const previous = await getState();
  const next = typeof updater === "function" ? (updater as (prev: LearningState) => LearningState)(previous) : updater;
  const normalized = normalizeState(next);
  try {
    await storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore persistence errors
  }
}

export function __setLearningStorageForTests(storage: AsyncStorageLike | null): void {
  const holder = globalThis as { __CADDIE_LEARNING_STORAGE__?: AsyncStorageLike };
  if (storage) {
    holder.__CADDIE_LEARNING_STORAGE__ = storage;
  } else {
    delete holder.__CADDIE_LEARNING_STORAGE__;
  }
  storagePromise = storage ? Promise.resolve(storage) : null;
}

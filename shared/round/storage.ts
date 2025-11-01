import type { RoundState } from './types';

export interface RoundStore {
  loadActive(): Promise<RoundState | null>;
  save(state: RoundState | null): Promise<void>;
  newRound(courseId: string, holeCount: number, ts: number, tournamentSafe: boolean): Promise<RoundState>;
}

export type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

const STORAGE_KEY = 'round.engine.v1';

const FALLBACK_STORAGE: AsyncStorageLike = (() => {
  const map = new Map<string, string>();
  return {
    async getItem(key: string): Promise<string | null> {
      return map.has(key) ? map.get(key)! : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      map.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      map.delete(key);
    },
  };
})();

const DEFAULT_PAR = 4;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hydrateRound(payload: unknown): RoundState | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  try {
    const record = payload as Record<string, unknown>;
    const id = String(record.id ?? '');
    const courseId = String(record.courseId ?? '');
    const startedAt = Number(record.startedAt);
    const currentHole = Number(record.currentHole);
    const tournamentSafe = Boolean(record.tournamentSafe);
    if (!id || !courseId || !Number.isFinite(startedAt) || !Number.isFinite(currentHole)) {
      return null;
    }
    const holesInput = record.holes as Record<string, unknown>;
    const holes: Record<number, RoundState['holes'][number]> = {};
    if (holesInput && typeof holesInput === 'object') {
      for (const [key, value] of Object.entries(holesInput)) {
        const holeNumber = Number(key);
        if (!Number.isFinite(holeNumber)) {
          continue;
        }
        const holeValue = value as Record<string, unknown>;
        const shots = Array.isArray(holeValue.shots) ? (holeValue.shots as RoundState['holes'][number]['shots']) : [];
        holes[holeNumber] = {
          hole: holeNumber,
          par: Number.isFinite(Number(holeValue.par)) ? Number(holeValue.par) : DEFAULT_PAR,
          index: Number.isFinite(Number(holeValue.index)) ? Number(holeValue.index) : undefined,
          pin: holeValue.pin && typeof holeValue.pin === 'object' ? clone(holeValue.pin) : undefined,
          shots: shots.map((shot, idx) => ({
            ...(shot as RoundState['holes'][number]['shots'][number]),
            seq: Number((shot as Record<string, unknown>).seq ?? idx + 1),
          })),
          sgTotal: Number.isFinite(Number(holeValue.sgTotal)) ? Number(holeValue.sgTotal) : undefined,
        };
      }
    }
    const finishedAt = Number.isFinite(Number(record.finishedAt)) ? Number(record.finishedAt) : undefined;
    return {
      id,
      courseId,
      startedAt,
      finishedAt,
      holes,
      currentHole,
      tournamentSafe,
    } satisfies RoundState;
  } catch {
    return null;
  }
}

class AsyncStorageRoundStore implements RoundStore {
  private storagePromise: Promise<AsyncStorageLike> | null = null;

  private async resolveStorage(): Promise<AsyncStorageLike> {
    if (!this.storagePromise) {
      this.storagePromise = (async () => {
        if (typeof globalThis !== 'undefined') {
          const override = (globalThis as { __ROUND_STORE_OVERRIDE__?: AsyncStorageLike }).__ROUND_STORE_OVERRIDE__;
          if (override) {
            return override;
          }
        }
        try {
          const mod = await import('@react-native-async-storage/async-storage');
          const candidate =
            mod && typeof mod === 'object' && 'default' in mod ? (mod.default as AsyncStorageLike) : (mod as AsyncStorageLike);
          if (candidate && typeof candidate.getItem === 'function' && typeof candidate.setItem === 'function') {
            return candidate;
          }
        } catch {
          // ignore, fallback below
        }
        return FALLBACK_STORAGE;
      })();
    }
    return this.storagePromise;
  }

  async loadActive(): Promise<RoundState | null> {
    const storage = await this.resolveStorage();
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      return hydrateRound(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async save(state: RoundState | null): Promise<void> {
    const storage = await this.resolveStorage();
    if (!state) {
      if (storage.removeItem) {
        await storage.removeItem(STORAGE_KEY);
      } else {
        await storage.setItem(STORAGE_KEY, '');
      }
      return;
    }
    try {
      await storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore persistence errors
    }
  }

  async newRound(courseId: string, holeCount: number, ts: number, tournamentSafe: boolean): Promise<RoundState> {
    const holes: RoundState['holes'] = {};
    for (let idx = 0; idx < holeCount; idx += 1) {
      const hole = idx + 1;
      holes[hole] = { hole, par: DEFAULT_PAR, shots: [] };
    }
    const round: RoundState = {
      id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `round-${ts}-${Math.floor(Math.random() * 1_000_000)}`,
      courseId,
      startedAt: ts,
      holes,
      currentHole: 1,
      tournamentSafe,
    };
    await this.save(round);
    return clone(round);
  }
}

let activeStore: RoundStore = new AsyncStorageRoundStore();

export function setRoundStore(store: RoundStore | null | undefined): void {
  if (store) {
    activeStore = store;
  }
}

export function getRoundStore(): RoundStore {
  return activeStore;
}

export const __test = {
  hydrateRound,
  FALLBACK_STORAGE,
};

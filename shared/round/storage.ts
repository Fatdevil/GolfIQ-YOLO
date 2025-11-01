import type { GeoPoint, Lie, RoundState, ShotEvent, ShotKind } from './types';

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

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function asGeoPoint(value: any): GeoPoint {
  if (value && typeof value === 'object' && isNum(value.lat) && isNum(value.lon)) {
    const ts = isNum(value.ts) ? value.ts : Date.now();
    return { lat: value.lat, lon: value.lon, ts };
  }
  throw new Error('Invalid GeoPoint');
}

function asLie(value: any): Lie {
  const lies: Lie[] = ['Tee', 'Fairway', 'Rough', 'Sand', 'Recovery', 'Green', 'Penalty'];
  if (typeof value === 'string' && lies.includes(value as Lie)) {
    return value as Lie;
  }
  throw new Error('Invalid Lie');
}

function asShotKind(value: any): ShotKind {
  const kinds: ShotKind[] = ['Full', 'Chip', 'Pitch', 'Putt', 'Recovery', 'Penalty'];
  if (typeof value === 'string' && kinds.includes(value as ShotKind)) {
    return value as ShotKind;
  }
  throw new Error('Invalid ShotKind');
}

function asOptionalNumber(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function parseShot(raw: any, holeNumber: number, fallbackSeq: number): ShotEvent | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  try {
    const record = raw as Record<string, unknown>;
    const idValue = record.id;
    if (typeof idValue !== 'string' || !idValue) {
      return null;
    }
    const start = asGeoPoint(record.start);
    const startLie = asLie(record.startLie);
    const kind = asShotKind(record.kind);
    const seqValue = Number(record.seq);
    const shot: ShotEvent = {
      id: idValue,
      hole: Number.isFinite(Number(record.hole)) ? Number(record.hole) : holeNumber,
      seq: Number.isFinite(seqValue) ? seqValue : fallbackSeq,
      start,
      startLie,
      kind,
    };
    if (typeof record.club === 'string' && record.club) {
      shot.club = record.club;
    }
    if (record.end) {
      shot.end = asGeoPoint(record.end);
    }
    if (record.endLie !== undefined) {
      shot.endLie = asLie(record.endLie);
    }
    const carry = asOptionalNumber(record.carry_m);
    if (carry !== undefined) {
      shot.carry_m = carry;
    }
    const toPinStart = asOptionalNumber(record.toPinStart_m);
    if (toPinStart !== undefined) {
      shot.toPinStart_m = toPinStart;
    }
    const toPinEnd = asOptionalNumber(record.toPinEnd_m);
    if (toPinEnd !== undefined) {
      shot.toPinEnd_m = toPinEnd;
    }
    const sg = asOptionalNumber(record.sg);
    if (sg !== undefined) {
      shot.sg = sg;
    }
    return shot;
  } catch {
    return null;
  }
}

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
        const shotsInput = Array.isArray(holeValue.shots) ? holeValue.shots : [];
        const shots: ShotEvent[] = [];
        for (let idx = 0; idx < shotsInput.length; idx += 1) {
          const parsed = parseShot(shotsInput[idx], holeNumber, idx + 1);
          if (parsed) {
            shots.push(parsed);
          }
        }
        holes[holeNumber] = {
          hole: holeNumber,
          par: Number.isFinite(Number(holeValue.par)) ? Number(holeValue.par) : DEFAULT_PAR,
          index: Number.isFinite(Number(holeValue.index)) ? Number(holeValue.index) : undefined,
          pin:
            holeValue.pin && typeof holeValue.pin === 'object' && isNum((holeValue.pin as any).lat) && isNum((holeValue.pin as any).lon)
              ? { lat: (holeValue.pin as any).lat, lon: (holeValue.pin as any).lon }
              : undefined,
          shots: shots.map(
            (shot, idx): ShotEvent => ({
              ...shot,
              seq: Number.isFinite(Number(shot.seq)) ? shot.seq : idx + 1,
            })
          ),
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

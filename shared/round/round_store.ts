import type { Hole, Round, Shot } from './round_types';

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

type RoundListener = (round: Round | null) => void;

type ParMap = Record<number, number>;

type RoundIdFactory = () => string;

type GlobalRoundStorage = typeof globalThis & {
  __QA_ROUND_STORAGE__?: AsyncStorageLike;
};

type ParsedRound = Round & { finished: boolean };

export const ROUND_FILE_NAME = 'round_run.json';

const STORAGE_KEY = 'qa.round.active.v1';

const DEFAULT_HOLES: readonly number[] = Array.from({ length: 18 }, (_, idx) => idx + 1);

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

let storagePromise: Promise<AsyncStorageLike> | null = null;
let activeRound: ParsedRound | null = null;
let roundLoaded = false;
const listeners = new Set<RoundListener>();
let idFactory: RoundIdFactory = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `round-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
};

function getGlobalStorageOverride(): AsyncStorageLike | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  const holder = globalThis as GlobalRoundStorage;
  const override = holder.__QA_ROUND_STORAGE__;
  if (
    override &&
    typeof override.getItem === 'function' &&
    typeof override.setItem === 'function'
  ) {
    return override;
  }
  return null;
}

async function loadStorage(): Promise<AsyncStorageLike> {
  if (storagePromise) {
    return storagePromise;
  }
  const override = getGlobalStorageOverride();
  if (override) {
    storagePromise = Promise.resolve(override);
    return storagePromise;
  }
  storagePromise = import('@react-native-async-storage/async-storage')
    .then((mod) => {
      const resolved =
        mod && typeof mod === 'object' && 'default' in mod
          ? (mod.default as AsyncStorageLike)
          : (mod as AsyncStorageLike);
      if (
        resolved &&
        typeof resolved.getItem === 'function' &&
        typeof resolved.setItem === 'function'
      ) {
        return resolved;
      }
      return fallbackStorage;
    })
    .catch(() => fallbackStorage);
  return storagePromise;
}

function cloneShot(shot: Shot): Shot {
  return {
    tStart: shot.tStart,
    tEnd: shot.tEnd,
    club: shot.club,
    base_m: shot.base_m,
    playsLike_m: shot.playsLike_m,
    carry_m: shot.carry_m,
    pin: { lat: shot.pin.lat, lon: shot.pin.lon },
    land: shot.land ? { lat: shot.land.lat, lon: shot.land.lon } : undefined,
    heading_deg: shot.heading_deg,
  };
}

function cloneHole(hole: Hole): Hole {
  return {
    holeNo: hole.holeNo,
    par: hole.par,
    shots: hole.shots.map((shot) => cloneShot(shot)),
    score: hole.score,
  };
}

function cloneRound(round: ParsedRound | null): ParsedRound | null {
  if (!round) {
    return null;
  }
  return {
    id: round.id,
    courseId: round.courseId,
    tee: round.tee,
    startedAt: round.startedAt,
    holes: round.holes.map((hole) => cloneHole(hole)),
    currentHole: Math.min(Math.max(round.currentHole, 0), Math.max(round.holes.length - 1, 0)),
    finished: Boolean(round.finished),
  };
}

function sanitizeShot(input: unknown): Shot | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const record = input as Record<string, unknown>;
  const club = typeof record.club === 'string' && record.club.trim() ? record.club.trim() : 'UNK';
  const base = Number(record.base_m);
  const playsLike = Number(record.playsLike_m ?? base);
  const tStart = Number(record.tStart);
  const tEndRaw = record.tEnd;
  const carryRaw = record.carry_m;
  const headingRaw = record.heading_deg ?? record.headingDeg;
  const pinRaw = record.pin;
  if (!Number.isFinite(tStart) || !pinRaw || typeof pinRaw !== 'object') {
    return null;
  }
  const pinLat = Number((pinRaw as Record<string, unknown>).lat);
  const pinLon = Number((pinRaw as Record<string, unknown>).lon);
  if (!Number.isFinite(pinLat) || !Number.isFinite(pinLon)) {
    return null;
  }
  const shot: Shot = {
    tStart,
    club,
    base_m: Number.isFinite(base) ? base : 0,
    playsLike_m: Number.isFinite(playsLike) ? playsLike : 0,
    pin: { lat: pinLat, lon: pinLon },
  };
  if (Number.isFinite(Number(tEndRaw))) {
    shot.tEnd = Number(tEndRaw);
  }
  if (Number.isFinite(Number(carryRaw))) {
    shot.carry_m = Number(carryRaw);
  }
  if (Number.isFinite(Number(headingRaw))) {
    shot.heading_deg = Number(headingRaw);
  }
  const landRaw = record.land;
  if (landRaw && typeof landRaw === 'object') {
    const lat = Number((landRaw as Record<string, unknown>).lat);
    const lon = Number((landRaw as Record<string, unknown>).lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      shot.land = { lat, lon };
    }
  }
  return shot;
}

function sanitizeHole(input: unknown): Hole | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const record = input as Record<string, unknown>;
  const holeNo = Number(record.holeNo);
  if (!Number.isFinite(holeNo)) {
    return null;
  }
  const par = Number(record.par);
  const shotsRaw = Array.isArray(record.shots) ? record.shots : [];
  const shots: Shot[] = [];
  for (const shotRaw of shotsRaw) {
    const shot = sanitizeShot(shotRaw);
    if (shot) {
      shots.push(shot);
    }
  }
  const hole: Hole = {
    holeNo: Math.max(1, Math.floor(holeNo)),
    par: Number.isFinite(par) ? Math.max(3, Math.min(6, Math.floor(par))) : 4,
    shots,
  };
  if (Number.isFinite(record.score)) {
    const score = Math.floor(Number(record.score));
    if (score > 0) {
      hole.score = score;
    }
  }
  return hole;
}

function sanitizeRound(input: unknown): ParsedRound | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const record = input as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : null;
  const courseId =
    typeof record.courseId === 'string' && record.courseId.trim() ? record.courseId.trim() : null;
  if (!id || !courseId) {
    return null;
  }
  const startedAt = Number(record.startedAt);
  if (!Number.isFinite(startedAt)) {
    return null;
  }
  const currentHoleRaw = Number(record.currentHole);
  const holesRaw = Array.isArray(record.holes) ? record.holes : [];
  const holes: Hole[] = [];
  for (const holeRaw of holesRaw) {
    const hole = sanitizeHole(holeRaw);
    if (hole) {
      holes.push(hole);
    }
  }
  if (!holes.length) {
    const defaultHoles = DEFAULT_HOLES.map((holeNo) => ({
      holeNo,
      par: 4,
      shots: [],
    }));
    return {
      id,
      courseId,
      tee: typeof record.tee === 'string' ? record.tee : undefined,
      startedAt,
      holes: defaultHoles,
      currentHole: 0,
      finished: Boolean(record.finished),
    };
  }
  holes.sort((a, b) => a.holeNo - b.holeNo);
  const currentHole = Number.isFinite(currentHoleRaw)
    ? Math.min(Math.max(Math.floor(currentHoleRaw), 0), holes.length - 1)
    : 0;
  return {
    id,
    courseId,
    tee: typeof record.tee === 'string' ? record.tee : undefined,
    startedAt,
    holes,
    currentHole,
    finished: Boolean(record.finished),
  };
}

function notify(): void {
  const snapshot = cloneRound(activeRound);
  for (const listener of listeners) {
    try {
      listener(snapshot ? cloneRound(snapshot) : null);
    } catch (error) {
      // ignore listener errors to avoid breaking others
    }
  }
}

async function persistRound(round: ParsedRound | null): Promise<void> {
  try {
    const storage = await loadStorage();
    if (!round) {
      if (typeof storage.removeItem === 'function') {
        await storage.removeItem(STORAGE_KEY);
      } else {
        await storage.setItem(STORAGE_KEY, '');
      }
      return;
    }
    const payload = JSON.stringify(round, null, 2);
    await storage.setItem(STORAGE_KEY, payload);
  } catch (error) {
    // ignore persistence errors for QA tooling
  }
}

function setActiveRound(round: ParsedRound | null): void {
  activeRound = round ? cloneRound(round) : null;
  roundLoaded = true;
  notify();
}

function buildDefaultParMap(holes: readonly number[]): ParMap {
  const map: ParMap = {};
  for (const holeNo of holes) {
    map[holeNo] = 4;
  }
  return map;
}

export function subscribe(listener: RoundListener): () => void {
  listeners.add(listener);
  const snapshot = cloneRound(activeRound);
  try {
    listener(snapshot ? cloneRound(snapshot) : null);
  } catch (error) {
    // ignore synchronous listener errors
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getActiveRound(): Round | null {
  const snapshot = cloneRound(activeRound);
  return snapshot ? cloneRound(snapshot) : null;
}

export async function loadRound(): Promise<Round | null> {
  if (roundLoaded) {
    return getActiveRound();
  }
  try {
    const storage = await loadStorage();
    const payload = await storage.getItem(STORAGE_KEY);
    if (!payload) {
      setActiveRound(null);
      return null;
    }
    const parsed = JSON.parse(payload);
    const round = sanitizeRound(parsed);
    setActiveRound(round);
    return getActiveRound();
  } catch (error) {
    setActiveRound(null);
    return null;
  }
}

export function createRound(
  courseId: string,
  holeNumbers?: number[],
  parMap?: ParMap,
  tee?: string,
): Round {
  const normalizedCourseId = typeof courseId === 'string' && courseId.trim() ? courseId.trim() : 'unknown-course';
  const holesInput = Array.isArray(holeNumbers) && holeNumbers.length ? holeNumbers : DEFAULT_HOLES;
  const unique = Array.from(new Set(holesInput.map((value) => Math.max(1, Math.floor(Number(value))))));
  unique.sort((a, b) => a - b);
  const initialParMap = parMap ?? buildDefaultParMap(unique);
  const holes: Hole[] = unique.map((holeNo) => ({
    holeNo,
    par: Number.isFinite(initialParMap[holeNo])
      ? Math.max(3, Math.min(6, Math.floor(initialParMap[holeNo])))
      : 4,
    shots: [],
  }));
  const round: ParsedRound = {
    id: idFactory(),
    courseId: normalizedCourseId,
    tee,
    startedAt: Date.now(),
    holes,
    currentHole: 0,
    finished: false,
  };
  setActiveRound(round);
  void persistRound(activeRound);
  return getActiveRound()!;
}

export function setTee(tee: string | undefined): Round | null {
  if (!activeRound) {
    return null;
  }
  activeRound.tee = tee;
  activeRound.finished = false;
  setActiveRound(activeRound);
  void persistRound(activeRound);
  return getActiveRound();
}

export function addShot(holeNo: number, shot: Shot): Round | null {
  if (!activeRound) {
    return null;
  }
  const target = activeRound.holes.find((hole) => hole.holeNo === holeNo);
  if (!target) {
    return getActiveRound();
  }
  const sanitized = sanitizeShot(shot);
  if (!sanitized) {
    return getActiveRound();
  }
  target.shots.push(sanitized);
  activeRound.finished = false;
  setActiveRound(activeRound);
  void persistRound(activeRound);
  return getActiveRound();
}

export function setScore(holeNo: number, strokes: number): Round | null {
  if (!activeRound) {
    return null;
  }
  const target = activeRound.holes.find((hole) => hole.holeNo === holeNo);
  if (!target) {
    return getActiveRound();
  }
  const normalized = Number.isFinite(strokes) ? Math.max(1, Math.floor(strokes)) : null;
  if (!normalized) {
    delete target.score;
  } else {
    target.score = normalized;
  }
  setActiveRound(activeRound);
  void persistRound(activeRound);
  return getActiveRound();
}

export function setPar(holeNo: number, par: number): Round | null {
  if (!activeRound) {
    return null;
  }
  const target = activeRound.holes.find((hole) => hole.holeNo === holeNo);
  if (!target) {
    return getActiveRound();
  }
  if (Number.isFinite(par)) {
    target.par = Math.max(3, Math.min(6, Math.floor(par)));
  }
  setActiveRound(activeRound);
  void persistRound(activeRound);
  return getActiveRound();
}

export function nextHole(): Round | null {
  if (!activeRound) {
    return null;
  }
  const nextIndex = Math.min(activeRound.holes.length - 1, activeRound.currentHole + 1);
  activeRound.currentHole = Math.max(0, nextIndex);
  setActiveRound(activeRound);
  void persistRound(activeRound);
  return getActiveRound();
}

export function prevHole(): Round | null {
  if (!activeRound) {
    return null;
  }
  const prevIndex = Math.max(0, activeRound.currentHole - 1);
  activeRound.currentHole = prevIndex;
  setActiveRound(activeRound);
  void persistRound(activeRound);
  return getActiveRound();
}

export function finishRound(): Round | null {
  if (!activeRound) {
    return null;
  }
  activeRound.finished = true;
  setActiveRound(activeRound);
  void persistRound(activeRound);
  return getActiveRound();
}

export async function saveRound(round: Round | null = null): Promise<void> {
  if (round) {
    const sanitized = sanitizeRound(round);
    setActiveRound(sanitized);
    await persistRound(activeRound);
    return;
  }
  await persistRound(activeRound);
}

export function resumeRound(round: Round): Round | null {
  const sanitized = sanitizeRound(round);
  setActiveRound(sanitized);
  void persistRound(activeRound);
  return getActiveRound();
}

export function serializeRound(round: Round): string {
  return JSON.stringify(round, null, 2);
}

export function parseRoundPayload(input: unknown): Round | null {
  return sanitizeRound(input);
}

export function clearRound(): void {
  activeRound = null;
  roundLoaded = true;
  void persistRound(null);
  notify();
}

export function __setRoundIdFactoryForTests(factory: RoundIdFactory | null): void {
  idFactory = factory ?? (() => `round-${Date.now()}`);
}

export function __setRoundStorageForTests(storage: AsyncStorageLike | null): void {
  storagePromise = storage ? Promise.resolve(storage) : null;
  if (storage) {
    const holder = globalThis as GlobalRoundStorage;
    holder.__QA_ROUND_STORAGE__ = storage;
  }
}

export function __resetRoundStoreForTests(): void {
  activeRound = null;
  roundLoaded = false;
  listeners.clear();
  storagePromise = null;
}

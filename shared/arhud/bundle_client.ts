export type BundleIndexEntry = {
  courseId: string;
  name?: string;
  bbox: [number, number, number, number];
  updatedAt?: string;
};

export type GreenSection = 'front' | 'middle' | 'back';
export type FatSide = 'L' | 'R';

export type GreenPin = {
  lat: number;
  lon: number;
  ts?: string | null;
};

export type GreenTarget = {
  id?: string | null;
  section: GreenSection | null;
  priority: number | null;
  rings: [number, number][][];
};

export type GreenInfo = {
  sections: GreenSection[];
  fatSide: FatSide | null;
  pin: GreenPin | null;
  targets?: GreenTarget[];
};

export type CourseFeature = {
  id?: string;
  type?: string;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
  green?: GreenInfo | null;
  [key: string]: unknown;
};

export type CourseBundle = {
  courseId: string;
  version: number;
  ttlSec: number;
  features: CourseFeature[];
  greensById: Record<string, GreenInfo>;
};

type CachedBundleRecord = {
  id: string;
  savedAt: number;
  ttlSec: number;
  etag: string | null;
  payload: CourseBundle;
};

type CacheBackend = {
  read(id: string): Promise<CachedBundleRecord | null>;
  write(record: CachedBundleRecord): Promise<void>;
  remove(id: string): Promise<void>;
  list?(): Promise<string[]>;
  describe(): string;
};

type BundleFetchMeta = {
  id: string;
  timestamp: number;
  fromCache: boolean;
  etag: string | null;
  backend: string;
};

type GlobalConfig = typeof globalThis & {
  ARHUD_BUNDLE_BASE?: string;
  ARHUD_BUNDLE_CACHE_DIR?: string;
  API_BASE?: string;
  EXPO_PUBLIC_API_BASE?: string;
  __ARHUD_BUNDLE_CACHE_DIR__?: string;
  __ARHUD_BUNDLE_FETCH_LOG__?: (payload: Record<string, unknown>) => void;
  RC?: Record<string, unknown> | null;
  __DEV__?: boolean;
};

const DEFAULT_BASE = 'http://localhost:8000';
const CACHE_DIR_NAME = 'bundles';
const DEFAULT_TTL_SEC = 3600;

const memoryCache = new Map<string, CachedBundleRecord>();
const inflight = new Map<string, Promise<CourseBundle>>();
const lastFetchMeta = new Map<string, BundleFetchMeta>();

let backendPromise: Promise<CacheBackend | null> | null = null;
let backendOverride: CacheBackend | null | undefined;
let backendLabel = 'memory';

const GREEN_SECTION_ORDER: readonly GreenSection[] = ['front', 'middle', 'back'];
const GREEN_SECTION_SET = new Set<GreenSection>(GREEN_SECTION_ORDER);
const GREEN_PIN_LAT_MIN = -90;
const GREEN_PIN_LAT_MAX = 90;
const GREEN_PIN_LON_MIN = -180;
const GREEN_PIN_LON_MAX = 180;

function getGlobalObject(): GlobalConfig {
  return globalThis as GlobalConfig;
}

function readEnv(key: string): string | undefined {
  if (typeof process === 'undefined') {
    return undefined;
  }
  const env = (process as { env?: Record<string, string | undefined> }).env;
  return env ? env[key] : undefined;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function resolveBase(): string {
  const globalObject = getGlobalObject();
  const base =
    globalObject.ARHUD_BUNDLE_BASE ??
    readEnv('ARHUD_BUNDLE_BASE') ??
    globalObject.API_BASE ??
    readEnv('API_BASE') ??
    globalObject.EXPO_PUBLIC_API_BASE ??
    readEnv('EXPO_PUBLIC_API_BASE') ??
    DEFAULT_BASE;
  return base.trim().replace(/\/$/, '');
}

function indexUrl(): string {
  const base = resolveBase();
  return `${base}/bundle/index`;
}

function bundleUrl(id: string): string {
  const base = resolveBase();
  const cleaned = id.replace(/^\/+/, '');
  return `${base}/bundle/course/${cleaned}`;
}

function normalizeSection(value: unknown): GreenSection | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return GREEN_SECTION_SET.has(normalized as GreenSection)
    ? (normalized as GreenSection)
    : null;
}

function normalizeFatSide(value: unknown): FatSide | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return normalized === 'L' || normalized === 'R' ? (normalized as FatSide) : null;
}

function normalizePin(value: unknown): GreenPin | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown> & { lat?: unknown; lon?: unknown; ts?: unknown };
  const lat = record.lat;
  const lon = record.lon;
  if (typeof lat !== 'number' || !Number.isFinite(lat)) {
    return null;
  }
  if (typeof lon !== 'number' || !Number.isFinite(lon)) {
    return null;
  }
  if (lat < GREEN_PIN_LAT_MIN || lat > GREEN_PIN_LAT_MAX) {
    return null;
  }
  if (lon < GREEN_PIN_LON_MIN || lon > GREEN_PIN_LON_MAX) {
    return null;
  }
  const tsRaw = record.ts;
  if (typeof tsRaw === 'string') {
    const trimmed = tsRaw.trim();
    return { lat, lon, ts: trimmed.length ? trimmed : null };
  }
  return { lat, lon, ts: null };
}

function normalizeCoordinatePair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }
  const lon = Number((value as unknown[])[0]);
  const lat = Number((value as unknown[])[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (lat < GREEN_PIN_LAT_MIN || lat > GREEN_PIN_LAT_MAX) {
    return null;
  }
  if (lon < GREEN_PIN_LON_MIN || lon > GREEN_PIN_LON_MAX) {
    return null;
  }
  return [lon, lat];
}

function normalizeCoordinateRing(value: unknown): [number, number][] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const points: [number, number][] = [];
  for (const entry of value as unknown[]) {
    const pair = normalizeCoordinatePair(entry);
    if (!pair) {
      continue;
    }
    points.push(pair);
  }
  return points.length ? points : null;
}

function normalizeCoordinateRings(value: unknown): [number, number][][] {
  const rings: [number, number][][] = [];
  const pushRing = (candidate: unknown) => {
    const ring = normalizeCoordinateRing(candidate);
    if (ring && ring.length >= 3) {
      rings.push(ring);
    }
  };
  if (!value) {
    return rings;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (Array.isArray(entry) && entry.length && Array.isArray(entry[0])) {
        // Multi-polygon handling
        const nested = normalizeCoordinateRings(entry);
        for (const ring of nested) {
          rings.push(ring);
        }
      } else {
        pushRing(entry);
      }
    }
  }
  return rings;
}

function normalizeGreenTargets(value: unknown): GreenTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const targets: GreenTarget[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const section = normalizeSection(record.section ?? record.label);
    const priorityRaw = record.priority ?? record.order ?? record.rank;
    const priority = Number.isFinite(priorityRaw as number)
      ? Number(priorityRaw)
      : typeof priorityRaw === 'string'
        ? Number(priorityRaw)
        : NaN;
    let rings: [number, number][][] = [];
    if (record.geometry && typeof record.geometry === 'object') {
      const geometry = record.geometry as Record<string, unknown> & { coordinates?: unknown };
      rings = normalizeCoordinateRings(geometry.coordinates);
    }
    if (!rings.length && Array.isArray(record.coordinates)) {
      rings = normalizeCoordinateRings(record.coordinates);
    }
    if (!rings.length && Array.isArray(record.rings)) {
      rings = normalizeCoordinateRings(record.rings);
    }
    if (!rings.length && Array.isArray(record.polygon)) {
      rings = normalizeCoordinateRings(record.polygon);
    }
    if (!rings.length) {
      continue;
    }
    const id = typeof record.id === 'string' ? record.id : typeof record.targetId === 'string' ? record.targetId : null;
    targets.push({
      id,
      section: section ?? null,
      priority: Number.isFinite(priority) ? Number(priority) : null,
      rings,
    });
  }
  return targets;
}

function normalizeGreenInfo(raw: unknown): GreenInfo | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown> & {
    sections?: unknown;
    fatSide?: unknown;
    pin?: unknown;
    targets?: unknown;
  };
  const sectionsRaw = record.sections;
  const sections: GreenSection[] = [];
  if (Array.isArray(sectionsRaw)) {
    for (const entry of sectionsRaw) {
      const section = normalizeSection(entry);
      if (section && !sections.includes(section)) {
        sections.push(section);
      }
    }
  }
  const fatSide = normalizeFatSide(record.fatSide);
  const pin = normalizePin(record.pin);
  const targetsRaw = record.targets ?? (record as Record<string, unknown>)['green_targets'];
  const targets = normalizeGreenTargets(targetsRaw);
  if (!sections.length && fatSide === null && !pin && !targets.length) {
    return null;
  }
  if (!sections.length) {
    sections.push(...GREEN_SECTION_ORDER);
  }
  return {
    sections,
    fatSide,
    pin,
    targets: targets.length ? targets : undefined,
  };
}

function parseBundle(json: unknown): CourseBundle {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid bundle payload');
  }
  const data = json as Record<string, unknown>;
  const courseId = typeof data.courseId === 'string' ? data.courseId : '';
  const version = typeof data.version === 'number' ? data.version : NaN;
  const ttlSecRaw = data.ttlSec;
  const featuresRaw = Array.isArray(data.features) ? data.features : [];
  const ttlSec = Number.isFinite(Number(ttlSecRaw)) ? Math.max(1, Math.floor(Number(ttlSecRaw))) : DEFAULT_TTL_SEC;
  if (!courseId) {
    throw new Error('Bundle payload missing courseId');
  }
  if (!Number.isFinite(version)) {
    throw new Error('Bundle payload missing version');
  }
  const greensById: Record<string, GreenInfo> = {};
  const features: CourseFeature[] = [];
  for (const entry of featuresRaw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const source = entry as Record<string, unknown>;
    const normalized = { ...source } as CourseFeature;
    if ('green' in normalized) {
      delete (normalized as Record<string, unknown>).green;
    }
    const geometry = source.geometry;
    if (geometry && typeof geometry === 'object') {
      normalized.geometry = geometry as { type?: string; coordinates?: unknown };
    }
    const properties = source.properties;
    if (properties && typeof properties === 'object') {
      normalized.properties = properties as Record<string, unknown>;
    }
    const id = typeof source.id === 'string' ? source.id : undefined;
    if (id) {
      normalized.id = id;
    }
    let rawGreen: unknown;
    if (Object.prototype.hasOwnProperty.call(source, 'green')) {
      rawGreen = (source as { green?: unknown }).green;
    } else if (normalized.properties && Object.prototype.hasOwnProperty.call(normalized.properties, 'green')) {
      rawGreen = (normalized.properties as Record<string, unknown>).green;
    }
    const greenInfo = normalizeGreenInfo(rawGreen);
    if (greenInfo) {
      const targets = Array.isArray(greenInfo.targets)
        ? greenInfo.targets.map((target) => ({
            id: target.id ?? null,
            section: target.section ?? null,
            priority: target.priority ?? null,
            rings: target.rings.map((ring) => ring.map((point) => [...point] as [number, number])),
          }))
        : undefined;
      normalized.green = {
        sections: [...greenInfo.sections],
        fatSide: greenInfo.fatSide,
        pin: greenInfo.pin ? { ...greenInfo.pin } : null,
        targets,
      };
      if (id) {
        greensById[id] = normalized.green;
      }
    }
    features.push(normalized);
  }
  return {
    courseId,
    version,
    ttlSec,
    features,
    greensById,
  };
}

function parseIndex(json: unknown): BundleIndexEntry[] {
  if (!Array.isArray(json)) {
    return [];
  }
  const entries: BundleIndexEntry[] = [];
  for (const entry of json) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const courseId = typeof record.courseId === 'string' ? record.courseId : null;
    if (!courseId) {
      continue;
    }
    const rawBbox = Array.isArray(record.bbox) ? record.bbox : null;
    if (!rawBbox || rawBbox.length !== 4) {
      continue;
    }
    const bboxValues = rawBbox.map((value) => Number(value));
    if (bboxValues.some((value) => !Number.isFinite(value))) {
      continue;
    }
    const name = typeof record.name === 'string' ? record.name : undefined;
    const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : undefined;
    entries.push({
      courseId,
      name,
      bbox: bboxValues as [number, number, number, number],
      updatedAt,
    });
  }
  return entries;
}

async function loadExpoBackend(): Promise<CacheBackend | null> {
  try {
    const FileSystem = (await import('expo-file-system')) as Record<string, unknown> & {
      documentDirectory?: string | null;
      getInfoAsync?: (path: string) => Promise<{ exists: boolean; isDirectory?: boolean; isFile?: boolean }>;
      readDirectoryAsync?: (path: string) => Promise<string[]>;
      readAsStringAsync?: (path: string, options?: { encoding?: string }) => Promise<string>;
      writeAsStringAsync?: (path: string, contents: string, options?: { encoding?: string }) => Promise<void>;
      deleteAsync?: (path: string, options?: { idempotent?: boolean }) => Promise<void>;
      makeDirectoryAsync?: (path: string, options?: { intermediates?: boolean }) => Promise<void>;
    };
    if (!FileSystem || typeof FileSystem !== 'object') {
      return null;
    }
    const base = FileSystem.documentDirectory;
    if (!base || typeof base !== 'string') {
      return null;
    }
    const root = `${base.replace(/\/+$/, '')}/${CACHE_DIR_NAME}`;
    const ensureRoot = async () => {
      if (FileSystem.makeDirectoryAsync) {
        await FileSystem.makeDirectoryAsync(root, { intermediates: true });
      }
    };
    const read = async (id: string) => {
      if (!FileSystem.getInfoAsync || !FileSystem.readAsStringAsync) {
        return null;
      }
      const filename = `${root}/${sanitizeId(id)}.json`;
      const info = await FileSystem.getInfoAsync(filename);
      if (!info.exists || info.isDirectory) {
        return null;
      }
      const contents = await FileSystem.readAsStringAsync(filename, { encoding: 'utf8' });
      return parseCachedRecord(contents, id);
    };
    const write = async (record: CachedBundleRecord) => {
      if (!FileSystem.writeAsStringAsync) {
        return;
      }
      await ensureRoot();
      const filename = `${root}/${sanitizeId(record.id)}.json`;
      const payload = JSON.stringify(record);
      await FileSystem.writeAsStringAsync(filename, payload, { encoding: 'utf8' });
    };
    const remove = async (id: string) => {
      if (!FileSystem.deleteAsync) {
        return;
      }
      const filename = `${root}/${sanitizeId(id)}.json`;
      await FileSystem.deleteAsync(filename, { idempotent: true });
    };
    const list = async () => {
      if (!FileSystem.readDirectoryAsync) {
        return [];
      }
      await ensureRoot();
      try {
        const entries = await FileSystem.readDirectoryAsync(root);
        const ids: string[] = [];
        for (const entry of entries) {
          if (typeof entry !== 'string' || !entry.endsWith('.json')) {
            continue;
          }
          const filename = `${root}/${entry}`;
          try {
            const raw = await FileSystem.readAsStringAsync?.(filename, { encoding: 'utf8' });
            if (!raw) {
              continue;
            }
            const parsed = JSON.parse(raw) as { id?: unknown };
            const id = typeof parsed.id === 'string' ? parsed.id : entry.replace(/\.json$/u, '');
            ids.push(id);
          } catch (error) {
            // ignore malformed entries
          }
        }
        return ids;
      } catch (error) {
        return [];
      }
    };
    return {
      read,
      write,
      remove,
      list,
      describe: () => `expo-file-system:${root}`,
    } satisfies CacheBackend;
  } catch (error) {
    return null;
  }
}

async function loadNodeBackend(): Promise<CacheBackend | null> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return null;
  }
  try {
    const fs = (await import('node:fs/promises')) as typeof import('node:fs/promises');
    const path = (await import('node:path')) as typeof import('node:path');
    const os = (await import('node:os')) as typeof import('node:os');
    const globalObject = getGlobalObject();
    const baseDir =
      globalObject.__ARHUD_BUNDLE_CACHE_DIR__ ??
      globalObject.ARHUD_BUNDLE_CACHE_DIR ??
      readEnv('ARHUD_BUNDLE_CACHE_DIR') ??
      path.join(os.tmpdir(), 'golfiq-arhud-bundles');
    const root = path.join(baseDir, CACHE_DIR_NAME);
    await fs.mkdir(root, { recursive: true });
    const read = async (id: string) => {
      const file = path.join(root, `${sanitizeId(id)}.json`);
      try {
        const contents = await fs.readFile(file, 'utf8');
        return parseCachedRecord(contents, id);
      } catch (error) {
        return null;
      }
    };
    const write = async (record: CachedBundleRecord) => {
      const file = path.join(root, `${sanitizeId(record.id)}.json`);
      const payload = JSON.stringify(record);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, payload, 'utf8');
    };
    const remove = async (id: string) => {
      const file = path.join(root, `${sanitizeId(id)}.json`);
      try {
        await fs.unlink(file);
      } catch (error) {
        // ignore missing files
      }
    };
    const list = async () => {
      try {
        const entries = await fs.readdir(root, { withFileTypes: true });
        const ids: string[] = [];
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith('.json')) {
            continue;
          }
          const file = path.join(root, entry.name);
          try {
            const raw = await fs.readFile(file, 'utf8');
            const parsed = JSON.parse(raw) as { id?: unknown };
            const id = typeof parsed.id === 'string' ? parsed.id : entry.name.replace(/\.json$/u, '');
            ids.push(id);
          } catch (error) {
            // ignore malformed entries
          }
        }
        return ids;
      } catch (error) {
        return [];
      }
    };
    return {
      read,
      write,
      remove,
      list,
      describe: () => `node-fs:${root}`,
    } satisfies CacheBackend;
  } catch (error) {
    return null;
  }
}

async function resolveBackend(): Promise<CacheBackend | null> {
  if (backendOverride !== undefined) {
    backendLabel = backendOverride ? backendOverride.describe() : 'memory';
    return backendOverride;
  }
  if (!backendPromise) {
    backendPromise = (async () => {
      const expo = await loadExpoBackend();
      if (expo) {
        backendLabel = expo.describe();
        return expo;
      }
      const nodeBackend = await loadNodeBackend();
      if (nodeBackend) {
        backendLabel = nodeBackend.describe();
        return nodeBackend;
      }
      backendLabel = 'memory';
      return null;
    })();
  }
  return backendPromise;
}

function parseCachedRecord(raw: string, id: string): CachedBundleRecord | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CachedBundleRecord> & { payload?: unknown };
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const payload = parsed.payload ? parseBundle(parsed.payload) : null;
    if (!payload) {
      return null;
    }
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
    const ttlSec = typeof parsed.ttlSec === 'number' ? parsed.ttlSec : DEFAULT_TTL_SEC;
    const etag = typeof parsed.etag === 'string' ? parsed.etag : null;
    return {
      id,
      savedAt,
      ttlSec,
      etag,
      payload,
    };
  } catch (error) {
    return null;
  }
}

async function readCache(id: string): Promise<CachedBundleRecord | null> {
  const existing = memoryCache.get(id);
  if (existing) {
    return existing;
  }
  const backend = await resolveBackend();
  if (!backend) {
    return null;
  }
  const stored = await backend.read(id);
  if (stored) {
    memoryCache.set(id, stored);
  }
  return stored;
}

async function writeCache(record: CachedBundleRecord): Promise<void> {
  memoryCache.set(record.id, record);
  const backend = await resolveBackend();
  if (backend) {
    await backend.write(record);
  }
}

async function removeCache(id: string): Promise<void> {
  memoryCache.delete(id);
  const backend = await resolveBackend();
  if (backend) {
    await backend.remove(id);
  }
}

async function listCacheIds(): Promise<string[]> {
  const backend = await resolveBackend();
  const ids = new Set<string>();
  for (const key of memoryCache.keys()) {
    ids.add(key);
  }
  if (backend?.list) {
    try {
      const listed = await backend.list();
      for (const id of listed) {
        if (typeof id === 'string' && id.trim()) {
          ids.add(sanitizeId(id));
        }
      }
    } catch (error) {
      // ignore listing errors
    }
  }
  return Array.from(ids);
}

function logBundleTelemetry(meta: BundleFetchMeta): void {
  lastFetchMeta.set(meta.id, meta);
  const globalObject = getGlobalObject();
  const sink = globalObject.__ARHUD_BUNDLE_FETCH_LOG__;
  if (typeof sink === 'function') {
    try {
      sink({
        event: 'bundle.fetch',
        id: meta.id,
        fromCache: meta.fromCache,
        etag: meta.etag ?? undefined,
        backend: meta.backend,
        timestamp: meta.timestamp,
      });
      return;
    } catch (error) {
      // swallow telemetry errors
    }
  }
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[bundle.fetch]', meta);
  }
}

function backendDescription(): string {
  return backendLabel;
}

function extendTtl(record: CachedBundleRecord, nowTs: number): CachedBundleRecord {
  return {
    ...record,
    savedAt: nowTs,
  };
}

type FetchResult =
  | { status: 'ok'; record: CachedBundleRecord }
  | { status: 'not-modified' };

async function fetchBundleFromNetwork(id: string, etag: string | null): Promise<FetchResult> {
  const url = bundleUrl(id);
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  if (etag) {
    headers.set('If-None-Match', etag);
  }
  const response = await fetch(url, { headers });
  if (response.status === 304) {
    return { status: 'not-modified' };
  }
  if (!response.ok) {
    throw new Error(`Bundle request failed (${response.status})`);
  }
  const json = await response.json();
  const payload = parseBundle(json);
  const nowTs = Date.now();
  const ttlSec = payload.ttlSec ?? DEFAULT_TTL_SEC;
  const cached: CachedBundleRecord = {
    id,
    payload,
    ttlSec,
    savedAt: nowTs,
    etag: response.headers.get('ETag'),
  };
  await writeCache(cached);
  logBundleTelemetry({
    id,
    timestamp: nowTs,
    fromCache: false,
    etag: cached.etag,
    backend: backendDescription(),
  });
  return { status: 'ok', record: cached };
}

function isValid(record: CachedBundleRecord, nowTs: number): boolean {
  if (!Number.isFinite(record.ttlSec) || record.ttlSec <= 0) {
    return false;
  }
  const expiry = record.savedAt + record.ttlSec * 1000;
  return expiry > nowTs;
}

export async function getIndex(): Promise<BundleIndexEntry[]> {
  const response = await fetch(indexUrl(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Index request failed (${response.status})`);
  }
  const json = await response.json();
  return parseIndex(json);
}

export async function getBundle(id: string): Promise<CourseBundle> {
  if (!id || typeof id !== 'string') {
    throw new Error('Bundle id is required');
  }
  const cleanedId = sanitizeId(id);
  if (inflight.has(cleanedId)) {
    return inflight.get(cleanedId)!;
  }
  const task = (async () => {
    const nowTs = Date.now();
    let cached: CachedBundleRecord | null = await readCache(cleanedId);
    if (cached && isValid(cached, nowTs)) {
      logBundleTelemetry({
        id: cleanedId,
        timestamp: nowTs,
        fromCache: true,
        etag: cached.etag,
        backend: backendDescription(),
      });
      return cached.payload;
    }
    try {
      const result = await fetchBundleFromNetwork(cleanedId, cached?.etag ?? null);
      if (result.status === 'ok') {
        inflight.delete(cleanedId);
        return result.record.payload;
      }
      // 304 Not Modified
      if (cached) {
        const refreshed = extendTtl(cached, Date.now());
        await writeCache(refreshed);
        logBundleTelemetry({
          id: cleanedId,
          timestamp: refreshed.savedAt,
          fromCache: true,
          etag: refreshed.etag,
          backend: backendDescription(),
        });
        return refreshed.payload;
      }
      throw new Error('Bundle not modified but cache missing');
    } catch (error) {
      if (cached) {
        logBundleTelemetry({
          id: cleanedId,
          timestamp: Date.now(),
          fromCache: true,
          etag: cached.etag,
          backend: backendDescription(),
        });
        return cached.payload;
      }
      inflight.delete(cleanedId);
      throw error;
    }
  })();
  inflight.set(cleanedId, task);
  try {
    const bundle = await task;
    inflight.delete(cleanedId);
    return bundle;
  } catch (error) {
    inflight.delete(cleanedId);
    throw error;
  }
}

export function getLastBundleFetchMeta(id: string): BundleFetchMeta | null {
  return lastFetchMeta.get(sanitizeId(id)) ?? null;
}

function readGreenInfo(
  bundle: CourseBundle | null | undefined,
  holeId: string | null | undefined,
): GreenInfo | null {
  if (!bundle || !holeId) {
    return null;
  }
  const fromIndex = bundle.greensById?.[holeId];
  if (fromIndex) {
    return fromIndex;
  }
  for (const feature of bundle.features) {
    if (feature && typeof feature === 'object' && feature.id === holeId && feature.green) {
      return feature.green;
    }
  }
  return null;
}

export function getGreenSections(
  bundle: CourseBundle | null | undefined,
  holeId: string | null | undefined,
): GreenSection[] {
  const info = readGreenInfo(bundle, holeId);
  if (!info || !Array.isArray(info.sections) || !info.sections.length) {
    return [];
  }
  return [...info.sections];
}

export function getFatSide(
  bundle: CourseBundle | null | undefined,
  holeId: string | null | undefined,
): FatSide | null {
  const info = readGreenInfo(bundle, holeId);
  return info?.fatSide ?? null;
}

export function getPin(
  bundle: CourseBundle | null | undefined,
  holeId: string | null | undefined,
): GreenPin | null {
  const info = readGreenInfo(bundle, holeId);
  if (!info?.pin) {
    return null;
  }
  return { ...info.pin };
}

export function __resetBundleClientForTests(): void {
  inflight.clear();
  memoryCache.clear();
  lastFetchMeta.clear();
  backendPromise = null;
  backendOverride = undefined;
  backendLabel = 'memory';
}

export function __setBundleCacheBackendForTests(backend: CacheBackend | null): void {
  backendOverride = backend;
  backendPromise = null;
  backendLabel = backend ? backend.describe() : 'memory';
}

export async function listCachedBundleIds(): Promise<string[]> {
  const ids = await listCacheIds();
  ids.sort();
  return ids;
}

export async function isBundleCached(id: string): Promise<boolean> {
  if (!id) {
    return false;
  }
  const cleaned = sanitizeId(id);
  const record = await readCache(cleaned);
  if (!record) {
    return false;
  }
  return isValid(record, Date.now());
}

export async function removeCachedBundle(id: string): Promise<void> {
  if (!id) {
    return;
  }
  const cleaned = sanitizeId(id);
  await removeCache(cleaned);
}


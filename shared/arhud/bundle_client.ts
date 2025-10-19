export type BundleIndexEntry = {
  courseId: string;
  name?: string;
  bbox: [number, number, number, number];
  updatedAt?: string;
};

export type CourseBundle = {
  courseId: string;
  version: number;
  ttlSec: number;
  features: any[];
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

function parseBundle(json: unknown): CourseBundle {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid bundle payload');
  }
  const data = json as Record<string, unknown>;
  const courseId = typeof data.courseId === 'string' ? data.courseId : '';
  const version = typeof data.version === 'number' ? data.version : NaN;
  const ttlSecRaw = data.ttlSec;
  const features = Array.isArray(data.features) ? data.features : [];
  const ttlSec = Number.isFinite(Number(ttlSecRaw)) ? Math.max(1, Math.floor(Number(ttlSecRaw))) : DEFAULT_TTL_SEC;
  if (!courseId) {
    throw new Error('Bundle payload missing courseId');
  }
  if (!Number.isFinite(version)) {
    throw new Error('Bundle payload missing version');
  }
  return {
    courseId,
    version,
    ttlSec,
    features,
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
    return {
      read,
      write,
      remove,
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
    return {
      read,
      write,
      remove,
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


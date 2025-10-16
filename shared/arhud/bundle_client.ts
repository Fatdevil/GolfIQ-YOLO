export type BundleFeature = {
  id: string;
  type: string;
  geometry: {
    type: "Polygon" | "MultiPolygon" | "LineString";
    coordinates: unknown;
  };
};

export type Bundle = {
  courseId: string;
  version: number;
  ttlSec: number;
  features: BundleFeature[];
};

export type CourseIndexEntry = {
  courseId: string;
  name?: string | null;
  bbox: [number, number, number, number];
  updatedAt: string;
  approx?: Record<string, unknown> | null;
};

export type BundleFetchInfo = {
  id: string;
  etag: string | null;
  fromCache: boolean;
  stale: boolean;
  timestamp: number;
  error?: string;
};

export interface BundleClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  now?: () => number;
  fileSystem?: ExpoFileSystemLike | null;
  onFetch?: (info: BundleFetchInfo) => void;
}

type ExpoFileSystemLike = {
  documentDirectory?: string | null;
  getInfoAsync?: (path: string) => Promise<{ exists: boolean; isDirectory?: boolean; isFile?: boolean }>;
  readAsStringAsync?: (path: string) => Promise<string>;
  writeAsStringAsync?: (path: string, contents: string) => Promise<void>;
  deleteAsync?: (path: string, options?: { idempotent?: boolean }) => Promise<void>;
  makeDirectoryAsync?: (path: string, options?: { intermediates?: boolean }) => Promise<void>;
};

type CacheEnvelope<T> = {
  id: string;
  etag: string | null;
  savedAt: number;
  expiresAt: number;
  payload: T;
};

type CacheKind = "index" | "bundle";

type FetchHeaders = Record<string, string>;

type StorageDriver = {
  basePath: string;
  read: (path: string) => Promise<string | null>;
  write: (path: string, contents: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  ensureDir: (path: string) => Promise<void>;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const INDEX_FILENAME = "index.json";

const inMemoryStore = new Map<string, string>();

function resolveBaseUrl(baseUrl?: string): string {
  if (baseUrl) {
    return baseUrl.replace(/\/+$/, "");
  }
  if (typeof process !== "undefined" && process.env) {
    const env = process.env as Record<string, string | undefined>;
    const fromEnv =
      env.EXPO_PUBLIC_API_BASE ||
      env.API_BASE ||
      env.QA_HUD_API_BASE ||
      env.ARHUD_API_BASE ||
      "";
    if (fromEnv) {
      return fromEnv.replace(/\/+$/, "");
    }
  }
  return "http://localhost:8000";
}

async function resolveExpoFileSystem(moduleOverride?: ExpoFileSystemLike | null): Promise<ExpoFileSystemLike | null> {
  if (moduleOverride) {
    return moduleOverride;
  }
  if (typeof require === "function") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const expoModule = require("expo-file-system") as ExpoFileSystemLike;
      return expoModule ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

async function createStorageDriver(options: {
  fileSystem?: ExpoFileSystemLike | null;
}): Promise<StorageDriver> {
  const module = await resolveExpoFileSystem(options.fileSystem);
  if (module && module.documentDirectory) {
    const root = `${module.documentDirectory.replace(/\/+$/, "")}/bundles`;
    const ensureDir = async (target: string) => {
      if (!module.makeDirectoryAsync) {
        return;
      }
      await module.makeDirectoryAsync(target, { intermediates: true });
    };
    const read = async (path: string) => {
      if (!module.getInfoAsync || !module.readAsStringAsync) {
        return null;
      }
      const info = await module.getInfoAsync(path);
      if (!info.exists || info.isDirectory) {
        return null;
      }
      return module.readAsStringAsync(path);
    };
    const write = async (path: string, contents: string) => {
      if (!module.writeAsStringAsync) {
        return;
      }
      const dir = path.replace(/\/+[^/]*$/, "");
      if (dir) {
        await ensureDir(dir);
      }
      await module.writeAsStringAsync(path, contents);
    };
    const remove = async (path: string) => {
      if (module.deleteAsync) {
        await module.deleteAsync(path, { idempotent: true });
      }
    };
    return {
      basePath: root,
      ensureDir: async (path: string) => {
        const dir = path.replace(/\/+[^/]*$/, "");
        if (dir) {
          await ensureDir(dir);
        }
      },
      read,
      write,
      remove,
    } satisfies StorageDriver;
  }
  const base = "memory://bundles";
  return {
    basePath: base,
    ensureDir: async () => undefined,
    read: async (path: string) => inMemoryStore.get(path) ?? null,
    write: async (path: string, contents: string) => {
      inMemoryStore.set(path, contents);
    },
    remove: async (path: string) => {
      inMemoryStore.delete(path);
    },
  } satisfies StorageDriver;
}

function parseCacheControl(header: string | null | undefined): number | null {
  if (!header) {
    return null;
  }
  const directives = header.toLowerCase().split(",");
  for (const directive of directives) {
    const [key, value] = directive.trim().split("=");
    if (key === "max-age" && value) {
      const ttl = Number.parseInt(value, 10);
      if (Number.isFinite(ttl) && ttl >= 0) {
        return ttl * 1000;
      }
    }
  }
  return null;
}

function safeParse<T>(raw: string): CacheEnvelope<T> | null {
  try {
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function serialize<T>(value: CacheEnvelope<T>): string {
  return JSON.stringify(value);
}

function isExpired(entry: CacheEnvelope<unknown>, now: number): boolean {
  return entry.expiresAt <= now;
}

function logTelemetry(callback: ((info: BundleFetchInfo) => void) | undefined, info: BundleFetchInfo): void {
  if (callback) {
    callback(info);
    return;
  }
  const message = `bundle.fetch ${info.id} etag=${info.etag ?? "-"} cache=${info.fromCache} stale=${info.stale}`;
  if (typeof console !== "undefined" && console.info) {
    console.info(message);
  }
}

function headersToObject(headers: Headers): FetchHeaders {
  const out: FetchHeaders = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function computeExpiry({ ttlMs, now }: { ttlMs: number | null; now: number }): number {
  const duration = ttlMs ?? DEFAULT_TTL_MS;
  return now + Math.max(duration, 0);
}

export type BundleClient = {
  getIndex: () => Promise<CourseIndexEntry[]>;
  getBundle: (id: string) => Promise<Bundle>;
  getLastFetchInfo: (id: string) => BundleFetchInfo | null;
  clearCache: (id?: string) => Promise<void>;
};

export function createBundleClient(options: BundleClientOptions = {}): BundleClient {
  const baseUrl = resolveBaseUrl(options.baseUrl);
  const fetchFn = options.fetchFn ?? (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);
  if (!fetchFn) {
    throw new Error("Fetch API is not available");
  }
  const now = options.now ?? (() => Date.now());

  const fetchLog = new Map<string, BundleFetchInfo>();
  let storagePromise: Promise<StorageDriver> | null = null;
  let indexCache: CacheEnvelope<CourseIndexEntry[]> | null = null;
  const bundleCache = new Map<string, CacheEnvelope<Bundle>>();

  const resolveStorage = () => {
    if (!storagePromise) {
      storagePromise = createStorageDriver({ fileSystem: options.fileSystem }).then((driver) => {
        return driver;
      });
    }
    return storagePromise;
  };

  const notify = (info: BundleFetchInfo) => {
    fetchLog.set(info.id, info);
    logTelemetry(options.onFetch, info);
  };

  const readFromDisk = async <T>(kind: CacheKind, id: string): Promise<CacheEnvelope<T> | null> => {
    const storage = await resolveStorage();
    const filename = kind === "index" ? INDEX_FILENAME : `${id}.json`;
    const path = `${storage.basePath.replace(/\/+$/, "")}/${filename}`;
    const raw = await storage.read(path);
    if (!raw) {
      return null;
    }
    const parsed = safeParse<T>(raw);
    if (!parsed) {
      await storage.remove(path);
      return null;
    }
    return parsed;
  };

  const writeToDisk = async <T>(kind: CacheKind, id: string, envelope: CacheEnvelope<T>) => {
    const storage = await resolveStorage();
    const filename = kind === "index" ? INDEX_FILENAME : `${id}.json`;
    const path = `${storage.basePath.replace(/\/+$/, "")}/${filename}`;
    await storage.ensureDir(path);
    await storage.write(path, serialize(envelope));
  };

  const loadBundle = async (id: string): Promise<CacheEnvelope<Bundle> | null> => {
    const memory = bundleCache.get(id);
    if (memory) {
      return memory;
    }
    const cached = await readFromDisk<Bundle>("bundle", id);
    if (cached) {
      bundleCache.set(id, cached);
      return cached;
    }
    return null;
  };

  const storeBundle = async (id: string, envelope: CacheEnvelope<Bundle>) => {
    bundleCache.set(id, envelope);
    await writeToDisk("bundle", id, envelope);
  };

  const storeIndex = async (envelope: CacheEnvelope<CourseIndexEntry[]>) => {
    indexCache = envelope;
    await writeToDisk("index", "index", envelope);
  };

  const fetchJson = async <T>(url: string, init: RequestInit): Promise<{ data: T; headers: FetchHeaders }> => {
    const response = await fetchFn(url, init);
    if (response.status === 304) {
      throw new Error("NOT_MODIFIED");
    }
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    const data = (await response.json()) as T;
    return { data, headers: headersToObject(response.headers) };
  };

  const getIndex = async () => {
    let cached = indexCache;
    if (!cached) {
      cached = await readFromDisk<CourseIndexEntry[]>("index", "index");
      if (cached) {
        indexCache = cached;
      }
    }
    const nowTs = now();
    if (cached && !isExpired(cached, nowTs)) {
      indexCache = cached;
      notify({
        id: "index",
        etag: cached.etag,
        fromCache: true,
        stale: false,
        timestamp: nowTs,
      });
      return cached.payload;
    }

    let etag: string | null = cached?.etag ?? null;

    try {
      const requestInit: RequestInit = {
        method: "GET",
        headers: etag ? { "If-None-Match": etag } : undefined,
      };
      const { data, headers } = await fetchJson<{ courses: CourseIndexEntry[] }>(
        `${baseUrl}/bundle/index`,
        requestInit,
      );
      const ttlMs = parseCacheControl(headers["cache-control"]) ?? DEFAULT_TTL_MS;
      const expiresAt = computeExpiry({ ttlMs, now: nowTs });
      etag = headers.etag ?? headers["etag"] ?? null;
      const envelope: CacheEnvelope<CourseIndexEntry[]> = {
        id: "index",
        etag,
        savedAt: nowTs,
        expiresAt,
        payload: data.courses ?? [],
      };
      await storeIndex(envelope);
      notify({ id: "index", etag, fromCache: false, stale: false, timestamp: nowTs });
      return envelope.payload;
    } catch (error) {
      if ((error as Error).message === "NOT_MODIFIED" && cached) {
        const ttlMs = DEFAULT_TTL_MS;
        const envelope: CacheEnvelope<CourseIndexEntry[]> = {
          ...cached,
          savedAt: nowTs,
          expiresAt: computeExpiry({ ttlMs, now: nowTs }),
        };
        await storeIndex(envelope);
        notify({ id: "index", etag, fromCache: true, stale: false, timestamp: nowTs });
        return envelope.payload;
      }
      if (cached) {
        notify({
          id: "index",
          etag: cached.etag,
          fromCache: true,
          stale: true,
          timestamp: nowTs,
          error: error instanceof Error ? error.message : String(error),
        });
        return cached.payload;
      }
      notify({
        id: "index",
        etag: null,
        fromCache: false,
        stale: true,
        timestamp: nowTs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const getBundle = async (id: string) => {
    const nowTs = now();
    const cached = await loadBundle(id);
    if (cached && !isExpired(cached, nowTs)) {
      notify({ id, etag: cached.etag, fromCache: true, stale: false, timestamp: nowTs });
      return cached.payload;
    }

    const conditionalHeaders: HeadersInit = {};
    if (cached?.etag) {
      conditionalHeaders["If-None-Match"] = cached.etag;
    }

    const fetchPromise = (async () => {
      try {
        const { data, headers } = await fetchJson<Bundle>(
          `${baseUrl}/bundle/course/${encodeURIComponent(id)}`,
          {
            method: "GET",
            headers: Object.keys(conditionalHeaders).length ? conditionalHeaders : undefined,
          },
        );
        const ttlSec = Number.isFinite(data.ttlSec) ? Number(data.ttlSec) : null;
        const ttlMsFromPayload = ttlSec ? ttlSec * 1000 : null;
        const ttlMs =
          parseCacheControl(headers["cache-control"]) ?? ttlMsFromPayload ?? DEFAULT_TTL_MS;
        const etag = headers.etag ?? headers["etag"] ?? null;
        const envelope: CacheEnvelope<Bundle> = {
          id,
          etag,
          savedAt: nowTs,
          expiresAt: computeExpiry({ ttlMs, now: nowTs }),
          payload: data,
        };
        await storeBundle(id, envelope);
        notify({ id, etag, fromCache: false, stale: false, timestamp: nowTs });
        return envelope.payload;
      } catch (error) {
        if ((error as Error).message === "NOT_MODIFIED" && cached) {
          const ttlMs = cached.payload.ttlSec ? cached.payload.ttlSec * 1000 : DEFAULT_TTL_MS;
          const refreshed: CacheEnvelope<Bundle> = {
            ...cached,
            savedAt: nowTs,
            expiresAt: computeExpiry({ ttlMs, now: nowTs }),
          };
          await storeBundle(id, refreshed);
          notify({ id, etag: cached.etag, fromCache: true, stale: false, timestamp: nowTs });
          return refreshed.payload;
        }
        if (cached) {
          notify({
            id,
            etag: cached.etag,
            fromCache: true,
            stale: true,
            timestamp: nowTs,
            error: error instanceof Error ? error.message : String(error),
          });
          return cached.payload;
        }
        notify({
          id,
          etag: null,
          fromCache: false,
          stale: true,
          timestamp: nowTs,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    })();

    if (cached) {
      // Serve stale data immediately; refresh in background.
      void fetchPromise.catch(() => undefined);
      notify({ id, etag: cached.etag, fromCache: true, stale: true, timestamp: nowTs });
      return cached.payload;
    }

    return fetchPromise;
  };

  const getLastFetchInfo = (id: string) => fetchLog.get(id) ?? null;

  const clearCache = async (id?: string) => {
    const storage = await resolveStorage();
    if (!id) {
      indexCache = null;
      bundleCache.clear();
      inMemoryStore.clear();
      await storage.remove(`${storage.basePath.replace(/\/+$/, "")}/${INDEX_FILENAME}`);
      return;
    }
    bundleCache.delete(id);
    await storage.remove(`${storage.basePath.replace(/\/+$/, "")}/${id}.json`);
  };

  return {
    getIndex,
    getBundle,
    getLastFetchInfo,
    clearCache,
  };
}

export const bundleClient = createBundleClient();

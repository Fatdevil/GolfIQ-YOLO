export type Platform = "android" | "ios";

export interface EdgeDefaults {
  runtime: "tflite" | "coreml" | "onnx" | "ncnn";
  inputSize: 320 | 384 | 416;
  quant: "int8" | "fp16" | "fp32";
  threads?: 1 | 2 | 4;
  delegate?: "cpu" | "nnapi" | "gpu";
}

export interface EdgeDefaultsMap {
  android?: EdgeDefaults;
  ios?: EdgeDefaults;
}

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

type GlobalWithEdgeDefaults = typeof globalThis & {
  EDGE_DEFAULTS_ENDPOINT?: string;
  EDGE_DEFAULTS_BASE?: string;
  __EDGE_DEFAULTS_STORAGE__?: AsyncStorageLike;
};

const CACHE_KEY = "edge.defaults.v1";

const RUNTIMES = ["tflite", "coreml", "onnx", "ncnn"] as const;
const INPUT_SIZES = [320, 384, 416] as const;
const QUANTS = ["int8", "fp16", "fp32"] as const;
const THREADS = [1, 2, 4] as const;
const DELEGATES = ["cpu", "nnapi", "gpu"] as const;

const FALLBACKS: EdgeDefaultsMap = {
  android: {
    runtime: "tflite",
    inputSize: 320,
    quant: "int8",
    threads: 4,
    delegate: "nnapi",
  },
  ios: {
    runtime: "coreml",
    inputSize: 384,
    quant: "fp16",
    threads: 2,
  },
};

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
    clear(): void {
      store.clear();
    },
  };
})();

type FallbackStorage = typeof fallbackStorage;

let storagePromise: Promise<AsyncStorageLike> | null = null;
let memoryCache: EdgeDefaultsMap | null = null;

function runtimeFrom(value: unknown): EdgeDefaults["runtime"] | null {
  if (typeof value !== "string") {
    return null;
  }
  const lower = value.trim().toLowerCase();
  return (RUNTIMES as readonly string[]).includes(lower)
    ? (lower as EdgeDefaults["runtime"])
    : null;
}

function quantFrom(value: unknown): EdgeDefaults["quant"] | null {
  if (typeof value !== "string") {
    return null;
  }
  const lower = value.trim().toLowerCase();
  return (QUANTS as readonly string[]).includes(lower)
    ? (lower as EdgeDefaults["quant"])
    : null;
}

function inputSizeFrom(value: unknown): EdgeDefaults["inputSize"] | null {
  if (typeof value !== "number") {
    return null;
  }
  const rounded = Math.round(value);
  return (INPUT_SIZES as readonly number[]).includes(rounded)
    ? (rounded as EdgeDefaults["inputSize"])
    : null;
}

function threadsFrom(value: unknown): EdgeDefaults["threads"] | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const numeric = Number(value);
  return (THREADS as readonly number[]).includes(numeric)
    ? (numeric as EdgeDefaults["threads"])
    : undefined;
}

function delegateFrom(value: unknown): EdgeDefaults["delegate"] | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const lower = String(value).trim().toLowerCase();
  return (DELEGATES as readonly string[]).includes(lower)
    ? (lower as EdgeDefaults["delegate"])
    : undefined;
}

function cloneDefaults(value: EdgeDefaults): EdgeDefaults {
  const clone: EdgeDefaults = {
    runtime: value.runtime,
    inputSize: value.inputSize,
    quant: value.quant,
  };
  if (value.threads !== undefined) {
    clone.threads = value.threads;
  }
  if (value.delegate !== undefined) {
    clone.delegate = value.delegate;
  }
  return clone;
}

function cloneMap(value: EdgeDefaultsMap): EdgeDefaultsMap {
  const output: EdgeDefaultsMap = {};
  if (value.android) {
    output.android = cloneDefaults(value.android);
  }
  if (value.ios) {
    output.ios = cloneDefaults(value.ios);
  }
  return output;
}

function normalizeDefaults(value: unknown): EdgeDefaults | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const data = value as Record<string, unknown>;
  const runtime = runtimeFrom(data.runtime);
  const inputSize = inputSizeFrom(data.inputSize);
  const quant = quantFrom(data.quant);
  if (!runtime || !inputSize || !quant) {
    return null;
  }
  const normalized: EdgeDefaults = {
    runtime,
    inputSize,
    quant,
  };
  const threads = threadsFrom(data.threads);
  if (threads !== undefined) {
    normalized.threads = threads;
  }
  const delegate = delegateFrom(data.delegate);
  if (delegate !== undefined) {
    normalized.delegate = delegate;
  }
  return normalized;
}

function normalizeMap(value: unknown): EdgeDefaultsMap {
  if (!value || typeof value !== "object") {
    return {};
  }
  const input = value as Record<string, unknown>;
  const result: EdgeDefaultsMap = {};
  const android = normalizeDefaults(input.android);
  if (android) {
    result.android = android;
  }
  const ios = normalizeDefaults(input.ios);
  if (ios) {
    result.ios = ios;
  }
  return result;
}

function getGlobal(): GlobalWithEdgeDefaults {
  return globalThis as GlobalWithEdgeDefaults;
}

function readEnv(key: string): string | undefined {
  if (typeof process === "undefined") {
    return undefined;
  }
  const env = (process as { env?: Record<string, string | undefined> }).env;
  return env ? env[key] : undefined;
}

function appendPlatform(url: string, platform?: Platform): string {
  if (!platform) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}platform=${platform}`;
}

function resolveEndpoint(platform?: Platform): string {
  const globalObject = getGlobal();
  const explicit = globalObject.EDGE_DEFAULTS_ENDPOINT ?? readEnv("EDGE_DEFAULTS_ENDPOINT");
  if (explicit) {
    return appendPlatform(explicit.replace(/\s+/g, ""), platform);
  }
  const base =
    globalObject.EDGE_DEFAULTS_BASE ??
    readEnv("EDGE_DEFAULTS_BASE") ??
    readEnv("EXPO_PUBLIC_API_BASE") ??
    readEnv("API_BASE") ??
    "";
  const trimmed = base.replace(/\s+/g, "").replace(/\/+$/, "");
  const path = trimmed ? `${trimmed}/bench/summary` : "/bench/summary";
  return appendPlatform(path, platform);
}

async function loadStorage(): Promise<AsyncStorageLike> {
  const globalObject = getGlobal();
  if (globalObject.__EDGE_DEFAULTS_STORAGE__) {
    return globalObject.__EDGE_DEFAULTS_STORAGE__;
  }
  if (storagePromise) {
    return storagePromise;
  }
  storagePromise = import("@react-native-async-storage/async-storage")
    .then((mod) => (mod && "default" in mod ? (mod.default as AsyncStorageLike) : (mod as AsyncStorageLike)))
    .catch(() => fallbackStorage);
  return storagePromise;
}

async function hydrateFromStorage(): Promise<EdgeDefaultsMap | null> {
  if (memoryCache) {
    return cloneMap(memoryCache);
  }
  try {
    const storage = await loadStorage();
    const raw = await storage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeMap(parsed);
    if (normalized.android || normalized.ios) {
      memoryCache = normalized;
      return cloneMap(normalized);
    }
  } catch {
    // ignore and fall through to null
  }
  return null;
}

async function persistCache(map: EdgeDefaultsMap): Promise<void> {
  try {
    const storage = await loadStorage();
    await storage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore persistence errors
  }
}

function fallbackMap(): EdgeDefaultsMap {
  return cloneMap(FALLBACKS);
}

function selectFromMap(map: EdgeDefaultsMap | null, platform: Platform): EdgeDefaults | null {
  if (!map) {
    return null;
  }
  const value = map[platform];
  return value ? cloneDefaults(value) : null;
}

export async function fetchEdgeDefaults(opts?: {
  platform?: Platform;
  signal?: AbortSignal;
}): Promise<EdgeDefaultsMap> {
  const url = resolveEndpoint(opts?.platform);
  try {
    const response = await fetch(url, { signal: opts?.signal });
    if (!response.ok) {
      const cached = await hydrateFromStorage();
      return cached ?? fallbackMap();
    }
    const payload = (await response.json()) as unknown;
    const normalized = normalizeMap(payload);
    if (normalized.android || normalized.ios) {
      memoryCache = normalized;
      await persistCache(normalized);
      return cloneMap(normalized);
    }
    const cached = await hydrateFromStorage();
    return cached ?? fallbackMap();
  } catch {
    const cached = await hydrateFromStorage();
    return cached ?? fallbackMap();
  }
}

export async function getCachedEdgeDefaults(platform: Platform): Promise<EdgeDefaults | null> {
  const cached = await hydrateFromStorage();
  if (cached) {
    const value = selectFromMap(cached, platform);
    if (value) {
      return value;
    }
  }
  const fallback = FALLBACKS[platform];
  return fallback ? cloneDefaults(fallback) : null;
}

export async function maybeEnforceEdgeDefaultsInRuntime(params: {
  platform: Platform;
  rcEnforce: boolean;
  apply: (d: EdgeDefaults) => void;
}): Promise<void> {
  if (!params.rcEnforce) {
    return;
  }
  const defaults = await getCachedEdgeDefaults(params.platform);
  if (defaults) {
    params.apply(defaults);
  }
}

export function __resetEdgeDefaultsCacheForTests(): void {
  memoryCache = null;
  (fallbackStorage as FallbackStorage).clear();
  storagePromise = null;
}

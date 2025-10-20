const STORAGE_KEY = "runs.upload.queue.v1";
const DEFAULT_BASE = "http://localhost:8000";
const MAX_BACKOFF_MS = 60_000;
const BASE_BACKOFF_MS = 2_000;

export type RunUploadKind = "hud" | "round";

export type UploadReceipt = {
  id: string;
  url: string;
};

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

type GlobalWithOverrides = typeof globalThis & {
  __QA_RUNS_UPLOAD_STORAGE__?: AsyncStorageLike;
  API_BASE?: string;
  EXPO_PUBLIC_API_BASE?: string;
  QA_API_BASE?: string;
  QA_HUD_API_KEY?: string;
  EXPO_PUBLIC_API_KEY?: string;
  API_KEY?: string;
};

type UploadTask = {
  localId: string;
  kind: RunUploadKind;
  payload: unknown;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
};

type StoredQueue = {
  tasks: UploadTask[];
};

type PendingResolver = {
  resolve: (receipt: UploadReceipt) => void;
  reject: (error: Error) => void;
};

const fallbackStorage: AsyncStorageLike = (() => {
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
  } satisfies AsyncStorageLike;
})();

let storagePromise: Promise<AsyncStorageLike> | null = null;
let queue: UploadTask[] | null = null;
let flushPromise: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const pendingResolvers = new Map<string, PendingResolver>();
let hydrationPromise: Promise<void> | null = null;

function getGlobal(): GlobalWithOverrides {
  return globalThis as GlobalWithOverrides;
}

function readEnv(key: string): string | undefined {
  if (typeof process === "undefined") {
    return undefined;
  }
  const env = (process as { env?: Record<string, string | undefined> }).env;
  return env ? env[key] : undefined;
}

function resolveApiBase(): string {
  const globalObject = getGlobal();
  const base =
    globalObject.QA_API_BASE ??
    readEnv("QA_API_BASE") ??
    globalObject.API_BASE ??
    readEnv("API_BASE") ??
    globalObject.EXPO_PUBLIC_API_BASE ??
    readEnv("EXPO_PUBLIC_API_BASE") ??
    DEFAULT_BASE;
  return base.trim().replace(/\/$/, "");
}

function resolveApiKey(): string | undefined {
  const globalObject = getGlobal();
  return (
    globalObject.QA_HUD_API_KEY ??
    readEnv("QA_HUD_API_KEY") ??
    globalObject.EXPO_PUBLIC_API_KEY ??
    readEnv("EXPO_PUBLIC_API_KEY") ??
    globalObject.API_KEY ??
    readEnv("API_KEY") ??
    undefined
  );
}

function resolveStorageOverride(): AsyncStorageLike | null {
  const globalObject = getGlobal();
  if (globalObject.__QA_RUNS_UPLOAD_STORAGE__) {
    return globalObject.__QA_RUNS_UPLOAD_STORAGE__;
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
      const candidate =
        mod && typeof mod === "object" && "default" in mod
          ? (mod.default as AsyncStorageLike)
          : (mod as AsyncStorageLike);
      if (
        candidate &&
        typeof candidate.getItem === "function" &&
        typeof candidate.setItem === "function"
      ) {
        return candidate;
      }
      return fallbackStorage;
    })
    .catch(() => fallbackStorage);
  return storagePromise;
}

function clonePayload(payload: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(payload ?? null));
  } catch (error) {
    throw new Error("Payload must be JSON-serializable");
  }
}

function generateLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function sanitizeTask(input: unknown): UploadTask | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  const kind = record.kind === "hud" || record.kind === "round" ? record.kind : null;
  if (!kind) {
    return null;
  }
  const payload = "payload" in record ? record.payload : null;
  const createdAt = Number(record.createdAt);
  const attempts = Number(record.attempts);
  const nextAttemptAt = Number(record.nextAttemptAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(attempts) || !Number.isFinite(nextAttemptAt)) {
    return null;
  }
  const localIdRaw = typeof record.localId === "string" && record.localId.trim() ? record.localId.trim() : generateLocalId();
  return {
    localId: localIdRaw,
    kind,
    payload,
    attempts: Math.max(0, Math.floor(attempts)),
    nextAttemptAt: Math.max(0, Math.floor(nextAttemptAt)),
    createdAt: Math.max(0, Math.floor(createdAt)),
  } satisfies UploadTask;
}

async function hydrateQueue(): Promise<void> {
  if (queue) {
    return;
  }
  const storage = await loadStorage();
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) {
      queue = [];
      return;
    }
    const parsed = JSON.parse(raw) as StoredQueue | UploadTask[] | null;
    if (!parsed) {
      queue = [];
      return;
    }
    const tasks = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as StoredQueue).tasks)
        ? (parsed as StoredQueue).tasks
        : [];
    queue = tasks
      .map((task) => sanitizeTask(task))
      .filter((task): task is UploadTask => Boolean(task));
  } catch (error) {
    queue = [];
  }
}

async function persistQueue(): Promise<void> {
  const storage = await loadStorage();
  if (!queue || queue.length === 0) {
    if (typeof storage.removeItem === "function") {
      await storage.removeItem(STORAGE_KEY);
    } else {
      await storage.setItem(STORAGE_KEY, JSON.stringify({ tasks: [] } satisfies StoredQueue));
    }
    return;
  }
  const snapshot: StoredQueue = { tasks: queue.map((task) => ({ ...task, payload: clonePayload(task.payload) })) };
  await storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function computeBackoffMs(attempts: number): number {
  const exp = Math.min(attempts, 8);
  const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exp);
  const jitter = Math.floor(Math.random() * Math.max(1000, base / 2));
  return base + jitter;
}

function scheduleFlush(delayMs = 0): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, Math.max(0, delayMs));
}

async function attemptUpload(task: UploadTask): Promise<"success" | "fatal" | "retry"> {
  const target = `${resolveApiBase()}/runs/${task.kind}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = resolveApiKey();
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }
  task.attempts += 1;
  try {
    const response = await fetch(target, {
      method: "POST",
      headers,
      body: JSON.stringify(task.payload ?? null),
    });
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const idRaw = data?.id;
      const urlRaw = data?.url;
      const id = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : "";
      const url = typeof urlRaw === "string" && urlRaw.trim() ? urlRaw.trim() : `/runs/${id}`;
      const resolver = pendingResolvers.get(task.localId);
      if (resolver) {
        resolver.resolve({ id, url });
        pendingResolvers.delete(task.localId);
      }
      return "success";
    }
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      const detail = await response.text().catch(() => "");
      const message = detail ? detail : `Upload failed (${response.status})`;
      const resolver = pendingResolvers.get(task.localId);
      if (resolver) {
        resolver.reject(new Error(message));
        pendingResolvers.delete(task.localId);
      }
      return "fatal";
    }
    const delay = computeBackoffMs(task.attempts);
    task.nextAttemptAt = Date.now() + delay;
    return "retry";
  } catch (error) {
    const delay = computeBackoffMs(task.attempts);
    task.nextAttemptAt = Date.now() + delay;
    return "retry";
  }
}

async function flushQueue(): Promise<void> {
  if (flushPromise) {
    return flushPromise;
  }
  flushPromise = (async () => {
    await (hydrationPromise ?? (hydrationPromise = hydrateQueue()));
    if (!queue) {
      queue = [];
    }
    while (queue.length > 0) {
      const task = queue[0];
      const now = Date.now();
      if (task.nextAttemptAt > now) {
        scheduleFlush(task.nextAttemptAt - now);
        break;
      }
      const outcome = await attemptUpload(task);
      if (outcome === "success" || outcome === "fatal") {
        queue.shift();
        await persistQueue();
        continue;
      }
      await persistQueue();
      scheduleFlush(Math.max(0, task.nextAttemptAt - Date.now()));
      break;
    }
    if (queue.length === 0) {
      await persistQueue();
    }
  })();
  try {
    await flushPromise;
  } finally {
    flushPromise = null;
  }
}

async function enqueue(kind: RunUploadKind, payload: unknown): Promise<UploadReceipt> {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable");
  }
  await (hydrationPromise ?? (hydrationPromise = hydrateQueue()));
  if (!queue) {
    queue = [];
  }
  const cloned = clonePayload(payload);
  const task: UploadTask = {
    localId: generateLocalId(),
    kind,
    payload: cloned,
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
  };
  queue.push(task);
  await persistQueue();

  return new Promise<UploadReceipt>((resolve, reject) => {
    pendingResolvers.set(task.localId, { resolve, reject });
    scheduleFlush(0);
  });
}

export async function uploadHudRun(payload: unknown): Promise<UploadReceipt> {
  return enqueue("hud", payload);
}

export async function uploadRoundRun(payload: unknown): Promise<UploadReceipt> {
  return enqueue("round", payload);
}

export async function resumePendingUploads(): Promise<void> {
  await (hydrationPromise ?? (hydrationPromise = hydrateQueue()));
  if (!queue || queue.length === 0) {
    return;
  }
  scheduleFlush(0);
}

export function __setRunsUploadStorageForTests(storage: AsyncStorageLike | null): void {
  const globalObject = getGlobal();
  if (storage) {
    globalObject.__QA_RUNS_UPLOAD_STORAGE__ = storage;
    storagePromise = Promise.resolve(storage);
  } else {
    delete globalObject.__QA_RUNS_UPLOAD_STORAGE__;
    storagePromise = null;
  }
}

export function __resetRunsUploadStateForTests(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  queue = null;
  flushPromise = null;
  hydrationPromise = null;
  pendingResolvers.clear();
}

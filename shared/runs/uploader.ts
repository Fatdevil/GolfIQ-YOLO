import type { ReliabilityEvent } from "../reliability/events";
import {
  __resetReliabilityEventsForTests,
  emitReliabilityEvent,
} from "../reliability/events";

const STORAGE_KEY = "runs.upload.queue.v1";
const DEFAULT_BASE = "http://localhost:8000";
const MAX_BACKOFF_MS = 60_000;
const BASE_BACKOFF_MS = 2_000;
const TASK_TTL_MS = 30 * 60 * 1_000; // 30 minutes
const DEFAULT_MAX_ATTEMPTS = 6;

export type RunUploadKind = "hud" | "round" | "accuracy";

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
  __QA_RUNS_UPLOAD_NETWORK__?: boolean | null;
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
  expiresAt: number;
  maxAttempts: number;
};

type StoredQueue = {
  tasks: UploadTask[];
};

type PendingResolver = {
  resolve: (receipt: UploadReceipt) => void;
  reject: (error: Error) => void;
};

type UploadQueueListener = (summary: UploadQueueSummary) => void;

type NetworkModule = {
  addNetworkStateListener?: (
    listener: (state: {
      isConnected: boolean | null;
      isInternetReachable?: boolean | null;
    }) => void,
  ) => { remove?: () => void } | (() => void);
  getNetworkStateAsync?: () => Promise<{
    isConnected: boolean | null;
    isInternetReachable?: boolean | null;
  }>;
};

export type UploadQueueSummary = {
  pending: number;
  inFlight: boolean;
  offline: boolean;
  nextAttemptAt: number | null;
  lastError: string | null;
  lastFailureAt: number | null;
  lastFailureToken: string | null;
  lastSuccessAt: number | null;
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
let networkInitPromise: Promise<void> | null = null;
let networkCleanup: (() => void) | null = null;
let networkOnline = true;
let networkOverride: boolean | null = null;
let activeUploadId: string | null = null;
let lastFailureAt: number | null = null;
let lastFailureMessage: string | null = null;
let lastFailureToken: string | null = null;
let lastSuccessAt: number | null = null;
const summaryListeners = new Set<UploadQueueListener>();
const EMPTY_SUMMARY: UploadQueueSummary = {
  pending: 0,
  inFlight: false,
  offline: false,
  nextAttemptAt: null,
  lastError: null,
  lastFailureAt: null,
  lastFailureToken: null,
  lastSuccessAt: null,
};
let currentSummary: UploadQueueSummary = { ...EMPTY_SUMMARY };

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

export function resolveRunsApiConfig(): { base: string; apiKey?: string } {
  return { base: resolveApiBase(), apiKey: resolveApiKey() };
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
  const expiresAt = Number(record.expiresAt);
  const maxAttempts = Number(record.maxAttempts);
  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(attempts) ||
    !Number.isFinite(nextAttemptAt)
  ) {
    return null;
  }
  const localIdRaw =
    typeof record.localId === "string" && record.localId.trim()
      ? record.localId.trim()
      : generateLocalId();
  const created = Math.max(0, Math.floor(createdAt));
  const ttl = Number.isFinite(expiresAt) ? Math.max(created, Math.floor(expiresAt)) : created + TASK_TTL_MS;
  const max = Number.isFinite(maxAttempts) && maxAttempts > 0 ? Math.floor(maxAttempts) : DEFAULT_MAX_ATTEMPTS;
  return {
    localId: localIdRaw,
    kind,
    payload,
    attempts: Math.max(0, Math.floor(attempts)),
    nextAttemptAt: Math.max(0, Math.floor(nextAttemptAt)),
    createdAt: created,
    expiresAt: ttl,
    maxAttempts: Math.max(1, max),
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
      currentSummary = computeSummary();
      return;
    }
    const parsed = JSON.parse(raw) as StoredQueue | UploadTask[] | null;
    if (!parsed) {
      queue = [];
      currentSummary = computeSummary();
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
  currentSummary = computeSummary();
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
  const snapshot: StoredQueue = {
    tasks: queue.map((task) => ({ ...task, payload: clonePayload(task.payload) })),
  };
  await storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function computeBackoffMs(attempts: number): number {
  const exp = Math.min(attempts, 8);
  const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exp);
  const jitter = Math.floor(Math.random() * Math.max(1_000, base / 2));
  return base + jitter;
}

function computeSummary(): UploadQueueSummary {
  const pending = queue ? queue.length : 0;
  const nextAttempt = pending && queue ? queue[0]!.nextAttemptAt : null;
  return {
    pending,
    inFlight: activeUploadId !== null,
    offline: !networkOnline,
    nextAttemptAt: nextAttempt ?? null,
    lastError: lastFailureMessage,
    lastFailureAt,
    lastFailureToken,
    lastSuccessAt,
  };
}

function notifySummary(): void {
  currentSummary = computeSummary();
  summaryListeners.forEach((listener) => {
    try {
      listener({ ...currentSummary });
    } catch {
      // ignore listener failures
    }
  });
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

function resolveNetworkOverride(): boolean | null {
  const globalObject = getGlobal();
  if (typeof globalObject.__QA_RUNS_UPLOAD_NETWORK__ === "boolean") {
    return globalObject.__QA_RUNS_UPLOAD_NETWORK__;
  }
  return null;
}

function interpretOnlineState(value: {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null;
} | null): boolean {
  if (!value) {
    return true;
  }
  if (value.isConnected === false) {
    return false;
  }
  if (value.isInternetReachable === false) {
    return false;
  }
  return true;
}

function setNetworkState(online: boolean, reason: string): void {
  const normalized = !!online;
  if (networkOnline === normalized) {
    return;
  }
  networkOnline = normalized;
  emitReliabilityEvent({
    type: "uploader:network",
    offline: !normalized,
    reason,
    timestamp: Date.now(),
  });
  notifySummary();
  if (normalized) {
    scheduleFlush(0);
  }
}

async function ensureNetworkMonitor(): Promise<void> {
  if (networkInitPromise) {
    return networkInitPromise;
  }
  networkOverride = resolveNetworkOverride();
  if (typeof networkOverride === "boolean") {
    networkOnline = networkOverride;
    notifySummary();
    return;
  }
  networkInitPromise = (async () => {
    try {
      const mod = (await import("expo-network")) as NetworkModule;
      if (!mod || typeof mod !== "object") {
        return;
      }
      if (typeof mod.getNetworkStateAsync === "function") {
        try {
          const snapshot = await mod.getNetworkStateAsync();
          setNetworkState(interpretOnlineState(snapshot), "initial");
        } catch {
          // ignore errors fetching initial state
        }
      }
      if (typeof mod.addNetworkStateListener === "function") {
        const subscription = mod.addNetworkStateListener((state) => {
          setNetworkState(interpretOnlineState(state), "listener");
        });
        if (typeof subscription === "function") {
          networkCleanup = subscription;
        } else if (subscription && typeof subscription.remove === "function") {
          networkCleanup = () => subscription.remove!();
        }
      }
    } catch {
      // ignore missing expo-network
    }
  })();
  await networkInitPromise;
}

function recordFailure(
  task: UploadTask,
  message: string,
  terminal: boolean,
  reason: string,
): void {
  lastFailureAt = Date.now();
  lastFailureMessage = message;
  lastFailureToken = `${task.localId}:${task.attempts}:${terminal ? "terminal" : "retry"}`;
  emitReliabilityEvent({
    type: "uploader:failure",
    localId: task.localId,
    kind: task.kind,
    attempts: task.attempts,
    terminal,
    reason,
    timestamp: lastFailureAt,
  });
  notifySummary();
}

function resolvePending(task: UploadTask, receipt: UploadReceipt): void {
  const resolver = pendingResolvers.get(task.localId);
  if (resolver) {
    resolver.resolve(receipt);
    pendingResolvers.delete(task.localId);
  }
}

function rejectPending(task: UploadTask, error: Error): void {
  const resolver = pendingResolvers.get(task.localId);
  if (resolver) {
    resolver.reject(error);
    pendingResolvers.delete(task.localId);
  }
}

async function attemptUpload(task: UploadTask): Promise<"success" | "fatal" | "retry"> {
  const target = `${resolveApiBase()}/runs/${task.kind}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = resolveApiKey();
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }
  task.attempts += 1;
  activeUploadId = task.localId;
  emitReliabilityEvent({
    type: "uploader:attempt",
    localId: task.localId,
    attempt: task.attempts,
    kind: task.kind,
    timestamp: Date.now(),
  });
  notifySummary();
  if (task.kind === "accuracy" && !apiKey) {
    const now = Date.now();
    resolvePending(task, { id: task.localId, url: "local://accuracy" });
    lastSuccessAt = now;
    lastFailureMessage = null;
    lastFailureToken = null;
    emitReliabilityEvent({
      type: "uploader:success",
      localId: task.localId,
      kind: task.kind,
      attempts: task.attempts,
      timestamp: now,
    });
    notifySummary();
    activeUploadId = null;
    return "success";
  }
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
      resolvePending(task, { id, url });
      lastSuccessAt = Date.now();
      lastFailureMessage = null;
      lastFailureToken = null;
      emitReliabilityEvent({
        type: "uploader:success",
        localId: task.localId,
        kind: task.kind,
        attempts: task.attempts,
        timestamp: lastSuccessAt,
      });
      notifySummary();
      return "success";
    }
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      const detail = await response.text().catch(() => "");
      const message = detail ? detail : `Upload failed (${response.status})`;
      recordFailure(task, message, true, `http-${response.status}`);
      rejectPending(task, new Error(message));
      return "fatal";
    }
    const delay = computeBackoffMs(task.attempts);
    task.nextAttemptAt = Date.now() + delay;
    recordFailure(task, `Retry scheduled in ${delay}ms`, false, "backoff");
    return "retry";
  } catch (error) {
    const delay = computeBackoffMs(task.attempts);
    task.nextAttemptAt = Date.now() + delay;
    const reason = error instanceof Error ? error.message : "network-error";
    recordFailure(task, `Retry scheduled in ${delay}ms`, false, reason);
    return "retry";
  } finally {
    activeUploadId = null;
    notifySummary();
  }
}

async function flushQueue(): Promise<void> {
  if (flushPromise) {
    return flushPromise;
  }
  flushPromise = (async () => {
    await (hydrationPromise ?? (hydrationPromise = hydrateQueue()));
    await ensureNetworkMonitor();
    if (!queue) {
      queue = [];
    }
    if (!networkOnline) {
      return;
    }
    while (queue.length > 0) {
      if (!networkOnline) {
        break;
      }
      const task = queue[0]!;
      const now = Date.now();
      if (task.expiresAt <= now) {
        const error = new Error("Upload expired before completing");
        recordFailure(task, error.message, true, "expired");
        rejectPending(task, error);
        queue.shift();
        await persistQueue();
        continue;
      }
      if (task.attempts >= task.maxAttempts) {
        const error = new Error("Upload failed after maximum retries");
        recordFailure(task, error.message, true, "max-attempts");
        rejectPending(task, error);
        queue.shift();
        await persistQueue();
        continue;
      }
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
    notifySummary();
  }
}

function emitQueuedEvent(task: UploadTask): void {
  const event: ReliabilityEvent = {
    type: "uploader:queued",
    localId: task.localId,
    kind: task.kind,
    pending: queue ? queue.length : 0,
    timestamp: Date.now(),
  };
  emitReliabilityEvent(event);
}

async function enqueue(kind: RunUploadKind, payload: unknown): Promise<UploadReceipt> {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable");
  }
  await (hydrationPromise ?? (hydrationPromise = hydrateQueue()));
  await ensureNetworkMonitor();
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
    expiresAt: Date.now() + TASK_TTL_MS,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
  };
  queue.push(task);
  await persistQueue();
  emitQueuedEvent(task);
  notifySummary();

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

export async function uploadAccuracyRun(payload: unknown): Promise<UploadReceipt> {
  return enqueue("accuracy", payload);
}

export async function resumePendingUploads(): Promise<void> {
  await (hydrationPromise ?? (hydrationPromise = hydrateQueue()));
  await ensureNetworkMonitor();
  if (!queue || queue.length === 0) {
    notifySummary();
    return;
  }
  scheduleFlush(0);
}

export async function getUploadQueueSummary(): Promise<UploadQueueSummary> {
  await (hydrationPromise ?? (hydrationPromise = hydrateQueue()));
  return { ...currentSummary };
}

export function subscribeToUploadQueueSummary(listener: UploadQueueListener): () => void {
  summaryListeners.add(listener);
  listener({ ...currentSummary });
  return () => {
    summaryListeners.delete(listener);
  };
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

export function __setRunsUploadNetworkStateForTests(online: boolean | null): void {
  networkOverride = online;
  if (typeof online === "boolean") {
    setNetworkState(online, "test");
  }
}

export function __resetRunsUploadStateForTests(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (networkCleanup) {
    try {
      networkCleanup();
    } catch {
      // ignore cleanup failures
    }
    networkCleanup = null;
  }
  storagePromise = null;
  queue = null;
  flushPromise = null;
  hydrationPromise = null;
  networkInitPromise = null;
  networkOnline = true;
  networkOverride = null;
  activeUploadId = null;
  lastFailureAt = null;
  lastFailureMessage = null;
  lastFailureToken = null;
  lastSuccessAt = null;
  currentSummary = { ...EMPTY_SUMMARY };
  summaryListeners.clear();
  pendingResolvers.clear();
  __resetReliabilityEventsForTests();
}

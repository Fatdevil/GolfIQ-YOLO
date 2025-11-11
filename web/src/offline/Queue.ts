import { createStore, del, get, set } from "idb-keyval";

import { emitQueueTelemetry } from "./telemetry";

export type JobType = "upload" | "score";

export type Job = {
  id: string;
  type: JobType;
  payload: unknown;
  attempt: number;
  nextAt: number;
  createdAt: number;
  meta?: Record<string, unknown> | null;
};

export type JobHandlerResult =
  | { status: "success" }
  | { status: "retry"; delayMs?: number; error?: unknown; reason?: string }
  | { status: "fail"; error?: unknown; reason?: string };

export type JobHandlerTools = {
  signal?: AbortSignal;
  update(updater: Job | ((job: Job) => Job | void)): Promise<void>;
};

export type JobHandler = (job: Job, tools: JobHandlerTools) => Promise<JobHandlerResult>;

export type QueueState = {
  pending: number;
  processing: boolean;
  online: boolean;
  lastError: string | null;
  lastErrorAt: number | null;
  lastErrorJobType: JobType | null;
  nextAttemptAt: number | null;
};

type OfflineQueueOptions = {
  handlers?: Partial<Record<JobType, JobHandler>>;
  storageKey?: string;
  random?: () => number;
  now?: () => number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
};

const STORE_DB = "golfiq-offline";
const STORE_NAME = "queue";
const DEFAULT_STORAGE_KEY = "offline.queue.jobs.v1";
const DEFAULT_MIN_BACKOFF = 2_000;
const DEFAULT_MAX_BACKOFF = 120_000;

const DEFAULT_STATE: QueueState = {
  pending: 0,
  processing: false,
  online: true,
  lastError: null,
  lastErrorAt: null,
  lastErrorJobType: null,
  nextAttemptAt: null,
};

export class OfflineQueue {
  private readonly store = createStore(STORE_DB, STORE_NAME);
  private readonly storageKey: string;
  private readonly handlers = new Map<JobType, JobHandler>();
  private readonly listeners = new Set<() => void>();
  private jobsCache: Job[] | null = null;
  private mutex: Promise<void> = Promise.resolve();
  private drainingPromise: Promise<void> | null = null;
  private state: QueueState = { ...DEFAULT_STATE };
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly minBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(options: OfflineQueueOptions = {}) {
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => Date.now());
    this.minBackoffMs = Math.max(0, options.minBackoffMs ?? DEFAULT_MIN_BACKOFF);
    this.maxBackoffMs = Math.max(
      this.minBackoffMs,
      options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF,
    );
    if (options.handlers) {
      for (const [key, handler] of Object.entries(options.handlers) as Array<[
        JobType,
        JobHandler | undefined,
      ]>) {
        if (handler) {
          this.handlers.set(key, handler);
        }
      }
    }
  }

  setHandler(type: JobType, handler: JobHandler | null | undefined): void {
    if (handler) {
      this.handlers.set(type, handler);
    } else {
      this.handlers.delete(type);
    }
  }

  async enqueue(job: Job): Promise<void> {
    const normalized = this.normalizeJob(job);
    await this.withLock(async () => {
      const jobs = await this.loadJobs();
      const updated = jobs.concat(normalized);
      await this.persistJobs(updated);
    });
    emitQueueTelemetry("queue.enqueued", {
      id: normalized.id,
      type: normalized.type,
      attempt: normalized.attempt,
      createdAt: normalized.createdAt,
      nextAt: normalized.nextAt,
    });
  }

  async size(): Promise<number> {
    return this.withLock(async () => {
      const jobs = await this.loadJobs();
      return jobs.length;
    });
  }

  async getJob(jobId: string): Promise<Job | null> {
    return this.withLock(async () => {
      const jobs = await this.loadJobs();
      const match = jobs.find((entry) => entry.id === jobId);
      if (!match) {
        return null;
      }
      return { ...match, meta: cloneMeta(match.meta) };
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): QueueState {
    return { ...this.state };
  }

  getServerSnapshot(): QueueState {
    return this.getSnapshot();
  }

  setOnline(online: boolean): void {
    this.updateState({ online });
  }

  clearLastError(): void {
    this.updateState({ lastError: null, lastErrorAt: null, lastErrorJobType: null });
  }

  async drain(signal?: AbortSignal): Promise<void> {
    if (this.drainingPromise) {
      return this.drainingPromise;
    }
    this.drainingPromise = this.runDrain(signal);
    try {
      await this.drainingPromise;
    } finally {
      this.drainingPromise = null;
    }
  }

  async updateJob(jobId: string, updater: Job | ((job: Job) => Job | void)): Promise<void> {
    await this.withLock(async () => {
      const jobs = await this.loadJobs();
      const index = jobs.findIndex((entry) => entry.id === jobId);
      if (index === -1) {
        return;
      }
      const current = jobs[index];
      const draft: Job = { ...current, meta: cloneMeta(current.meta) };
      const next = typeof updater === "function" ? updater(draft) ?? draft : updater;
      if (!next) {
        return;
      }
      const normalized = this.normalizeJob(next as Job, current);
      const updated = jobs.slice();
      updated[index] = normalized;
      await this.persistJobs(updated);
    });
  }

  private async runDrain(signal?: AbortSignal): Promise<void> {
    const processed: Job[] = [];
    this.updateState({ processing: true });
    try {
      while (!signal?.aborted) {
        const job = await this.takeNextDue();
        if (!job) {
          break;
        }
        const handler = this.handlers.get(job.type);
        if (!handler) {
          await this.failJob(job, new Error(`No handler registered for ${job.type}`));
          processed.push(job);
          continue;
        }
        try {
          const result = await handler(job, {
            signal,
            update: (updater) => this.updateJob(job.id, updater),
          });
          if (result.status === "success") {
            await this.completeJob(job);
            processed.push(job);
            continue;
          }
          if (result.status === "fail") {
            await this.failJob(job, result.error, result.reason);
            processed.push(job);
            continue;
          }
          const delay = this.resolveDelay(job, result.delayMs);
          await this.scheduleRetry(job, delay, result.error, result.reason);
        } catch (error) {
          const delay = this.computeBackoff(job.attempt);
          await this.scheduleRetry(job, delay, error, "handler-error");
        }
        if (signal?.aborted) {
          break;
        }
      }
    } finally {
      this.updateState({ processing: false });
      if (processed.length) {
        emitQueueTelemetry("queue.drain", {
          processed: processed.length,
          types: Array.from(new Set(processed.map((job) => job.type))),
        });
      }
    }
  }

  private async takeNextDue(): Promise<Job | null> {
    return this.withLock(async () => {
      const jobs = await this.loadJobs();
      if (!jobs.length) {
        this.refreshState(jobs);
        return null;
      }
      const [head] = jobs;
      if (!head) {
        this.refreshState(jobs);
        return null;
      }
      const now = this.now();
      if (head.nextAt > now) {
        this.refreshState(jobs);
        return null;
      }
      const updatedHead: Job = {
        ...head,
        attempt: head.attempt + 1,
        nextAt: now,
        meta: cloneMeta(head.meta),
      };
      const updated = jobs.slice();
      updated[0] = updatedHead;
      await this.persistJobs(updated);
      return { ...updatedHead };
    });
  }

  private async completeJob(job: Job): Promise<void> {
    await this.withLock(async () => {
      const jobs = await this.loadJobs();
      const updated = jobs.filter((entry) => entry.id !== job.id);
      await this.persistJobs(updated);
    });
    this.updateState({
      lastError: null,
      lastErrorAt: null,
      lastErrorJobType: null,
    });
    emitQueueTelemetry("queue.sent", {
      id: job.id,
      type: job.type,
      attempt: job.attempt,
    });
  }

  private async failJob(job: Job, error: unknown, reason?: string): Promise<void> {
    await this.withLock(async () => {
      const jobs = await this.loadJobs();
      const updated = jobs.filter((entry) => entry.id !== job.id);
      await this.persistJobs(updated);
    });
    const message = this.renderError(error, reason);
    this.updateState({
      lastError: message,
      lastErrorAt: this.now(),
      lastErrorJobType: job.type,
    });
    emitQueueTelemetry("queue.fail", {
      id: job.id,
      type: job.type,
      attempt: job.attempt,
      reason: reason ?? null,
      message,
    });
  }

  private async scheduleRetry(
    job: Job,
    delayMs: number,
    error: unknown,
    reason?: string,
  ): Promise<void> {
    const nextAt = this.now() + Math.max(0, delayMs);
    await this.updateJob(job.id, (current) => {
      current.nextAt = nextAt;
      current.attempt = job.attempt;
      return current;
    });
    const message = this.renderError(error, reason);
    this.updateState({
      lastError: message,
      lastErrorAt: this.now(),
      lastErrorJobType: job.type,
    });
    emitQueueTelemetry("queue.retry", {
      id: job.id,
      type: job.type,
      attempt: job.attempt,
      delayMs,
      reason: reason ?? null,
      message,
    });
  }

  private resolveDelay(job: Job, delay?: number): number {
    if (typeof delay === "number" && Number.isFinite(delay)) {
      return Math.max(0, Math.min(this.maxBackoffMs, delay));
    }
    return this.computeBackoff(job.attempt);
  }

  private computeBackoff(attempt: number): number {
    const exp = this.minBackoffMs * Math.pow(2, Math.max(0, attempt - 1));
    const base = Math.min(this.maxBackoffMs, Math.max(this.minBackoffMs, exp));
    const jitter = Math.round(this.random() * this.minBackoffMs);
    return Math.min(this.maxBackoffMs, base + jitter);
  }

  private renderError(error: unknown, reason?: string): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (typeof error === "string" && error.trim()) {
      return error.trim();
    }
    if (reason) {
      return reason;
    }
    return "queue-error";
  }

  private async loadJobs(): Promise<Job[]> {
    if (this.jobsCache) {
      return this.jobsCache;
    }
    const stored = (await get(this.storageKey, this.store).catch(() => null)) as Job[] | null;
    const jobs = Array.isArray(stored)
      ? stored.map((job) => this.normalizeJob(job))
      : [];
    this.jobsCache = this.sortJobs(jobs);
    this.refreshState(this.jobsCache);
    return this.jobsCache;
  }

  private async persistJobs(jobs: Job[]): Promise<void> {
    const sorted = this.sortJobs(jobs);
    this.jobsCache = sorted;
    if (sorted.length === 0) {
      await del(this.storageKey, this.store);
    } else {
      await set(this.storageKey, sorted, this.store);
    }
    this.refreshState(sorted);
  }

  private sortJobs(jobs: Job[]): Job[] {
    return jobs
      .slice()
      .sort((a, b) =>
        a.nextAt === b.nextAt
          ? a.createdAt - b.createdAt
          : a.nextAt - b.nextAt,
      );
  }

  private normalizeJob(job: Job, previous?: Job): Job {
    const baseline = previous ?? job;
    const createdAt =
      typeof job.createdAt === "number"
        ? job.createdAt
        : typeof baseline.createdAt === "number"
        ? baseline.createdAt
        : this.now();
    const attempt =
      typeof job.attempt === "number"
        ? job.attempt
        : typeof baseline.attempt === "number"
        ? baseline.attempt
        : 0;
    const nextAt =
      typeof job.nextAt === "number"
        ? job.nextAt
        : typeof baseline.nextAt === "number"
        ? baseline.nextAt
        : createdAt;
    return {
      id: baseline.id,
      type: baseline.type,
      payload: job.payload ?? baseline.payload,
      attempt,
      nextAt,
      createdAt,
      meta: normalizeMeta(job.meta, baseline.meta),
    };
  }

  private refreshState(jobs: Job[] | null): void {
    const next = jobs && jobs.length ? jobs[0].nextAt : null;
    this.updateState({ pending: jobs ? jobs.length : 0, nextAttemptAt: next });
  }

  private updateState(patch: Partial<QueueState>): void {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[offline/queue] listener failed", error);
        }
      }
    }
  }

  private async withLock<T>(task: () => Promise<T>): Promise<T> {
    const run = this.mutex.then(task, task);
    this.mutex = run
      .then(() => undefined)
      .catch(() => undefined);
    return run;
  }
}

function cloneMeta(meta: unknown): Record<string, unknown> | undefined {
  if (!isRecord(meta)) {
    return undefined;
  }
  return { ...meta };
}

function normalizeMeta(
  meta: unknown,
  fallback?: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (isRecord(meta)) {
    return { ...meta };
  }
  if (isRecord(fallback)) {
    return { ...fallback };
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}


import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetRunsUploadStateForTests,
  __setRunsUploadNetworkStateForTests,
  __setRunsUploadStorageForTests,
  getUploadQueueSummary,
  resumePendingUploads,
  uploadHudRun,
  uploadRoundRun,
} from "../uploader";

type MemoryStorage = {
  store: Map<string, string>;
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

function createMemoryStorage(): MemoryStorage {
  const store = new Map<string, string>();
  return {
    store,
    async getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    async setItem(key: string, value: string) {
      store.set(key, value);
    },
    async removeItem(key: string) {
      store.delete(key);
    },
  } satisfies MemoryStorage;
}

const STORAGE_KEY = "runs.upload.queue.v1";

async function flushAsyncWork(): Promise<void> {
  // Allow any pending microtasks from async queue hydration/persistence to
  // settle before assertions that inspect in-memory storage or timers.
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForQueuePersistence(
  storage: MemoryStorage,
  predicate: (raw: string) => boolean = () => true,
): Promise<string> {
  // Repeatedly yield to the microtask queue while checking for serialized
  // queue state to appear in the in-memory storage used by tests. Using a
  // bounded iteration avoids hanging under fake timers where Date.now() is
  // fixed unless explicitly advanced.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const raw = storage.store.get(STORAGE_KEY);
    if (typeof raw === "string" && predicate(raw)) {
      return raw;
    }
    await flushAsyncWork();
  }
  throw new Error("Timed out waiting for queue persistence");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  __resetRunsUploadStateForTests();
  (globalThis as { __QA_RUNS_UPLOAD_NETWORK__?: boolean }).__QA_RUNS_UPLOAD_NETWORK__ = true;
  __setRunsUploadNetworkStateForTests(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (globalThis as { __QA_RUNS_UPLOAD_NETWORK__?: boolean }).__QA_RUNS_UPLOAD_NETWORK__;
  __setRunsUploadStorageForTests(null);
  __resetRunsUploadStateForTests();
});

describe("runs uploader", () => {
  it("uploads HUD payload and resolves receipt", async () => {
    const storage = createMemoryStorage();
    __setRunsUploadStorageForTests(storage);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ id: "share-abc", url: "/runs/share-abc" }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    expect((globalThis as { fetch?: unknown }).fetch).toBe(fetchMock);

    const payload = [
      { timestampMs: 1, event: "hud.frame", data: { fps: 60 } },
      { timestampMs: 2, event: "hud.frame", data: { fps: 58 } },
    ];

    const receiptPromise = uploadHudRun(payload);
    const storedBefore = await waitForQueuePersistence(storage);
    expect(storedBefore).toBeTruthy();
    await vi.advanceTimersToNextTimerAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const receipt = await receiptPromise;
    expect(receipt).toEqual({ id: "share-abc", url: "/runs/share-abc" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:8000/runs/hud");
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
    const body = init?.body as string;
    expect(JSON.parse(body)).toEqual(payload);
  });

  it("retries with backoff and eventually succeeds", async () => {
    const storage = createMemoryStorage();
    __setRunsUploadStorageForTests(storage);

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ id: "share-retry", url: "/runs/share-retry" }),
      } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const payload = [{ timestampMs: 10, event: "hud.frame", data: {} }];
    const receiptPromise = uploadHudRun(payload);
    await waitForQueuePersistence(storage);

    // allow initial attempt
    await vi.advanceTimersToNextTimerAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const stored = storage.store.get(STORAGE_KEY);
    expect(stored).toBeTruthy();
    if (!stored) throw new Error("Queue missing");
    const parsed = JSON.parse(stored) as {
      tasks: { attempts: number; nextAttemptAt: number; expiresAt: number; maxAttempts: number }[];
    };
    expect(parsed.tasks[0]?.attempts).toBe(1);
    const nowAfterFailure = Date.now();
    expect(parsed.tasks[0]?.nextAttemptAt).toBe(nowAfterFailure + 4_000);
    expect(parsed.tasks[0]?.expiresAt).toBeGreaterThan(nowAfterFailure + 4_000);
    expect(parsed.tasks[0]?.maxAttempts).toBeGreaterThan(1);

    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersToNextTimerAsync();

    const receipt = await receiptPromise;
    expect(receipt.id).toBe("share-retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(storage.store.has(STORAGE_KEY)).toBe(false);
  });

  it("persists queue across resets and resumes", async () => {
    const storage = createMemoryStorage();
    __setRunsUploadStorageForTests(storage);

    const failingFetch = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", failingFetch);

    const pending = uploadRoundRun({ id: "round-1", holes: [] });
    await waitForQueuePersistence(storage);
    await vi.advanceTimersToNextTimerAsync();
    const raw = storage.store.get(STORAGE_KEY);
    expect(raw).toBeTruthy();
    void pending.catch(() => {});

    vi.restoreAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const successFetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ id: "round-share", url: "/runs/round-share" }),
      } as unknown as Response);
    vi.stubGlobal("fetch", successFetch);

    __resetRunsUploadStateForTests();
    __setRunsUploadStorageForTests(storage);

    await resumePendingUploads();
    await waitForQueuePersistence(storage);
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersToNextTimerAsync();

    expect(successFetch).toHaveBeenCalledTimes(1);
    const cleared = storage.store.get(STORAGE_KEY);
    expect(cleared).toBeUndefined();
  });

  it("pauses uploads while offline and resumes when back online", async () => {
    const storage = createMemoryStorage();
    __setRunsUploadStorageForTests(storage);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ id: "offline-resume", url: "/runs/offline-resume" }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    (globalThis as { __QA_RUNS_UPLOAD_NETWORK__?: boolean }).__QA_RUNS_UPLOAD_NETWORK__ = false;
    __setRunsUploadNetworkStateForTests(false);

    const receiptPromise = uploadHudRun({ event: "hud.frame", timestampMs: 1 });
    await waitForQueuePersistence(storage);
    await vi.advanceTimersToNextTimerAsync();

    expect(fetchMock).not.toHaveBeenCalled();
    const summaryOffline = await getUploadQueueSummary();
    expect(summaryOffline.offline).toBe(true);
    expect(summaryOffline.pending).toBe(1);

    (globalThis as { __QA_RUNS_UPLOAD_NETWORK__?: boolean }).__QA_RUNS_UPLOAD_NETWORK__ = true;
    __setRunsUploadNetworkStateForTests(true);
    await vi.advanceTimersToNextTimerAsync();

    const receipt = await receiptPromise;
    expect(receipt.id).toBe("offline-resume");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const summaryOnline = await getUploadQueueSummary();
    expect(summaryOnline.pending).toBe(0);
    expect(summaryOnline.offline).toBe(false);
  });
});

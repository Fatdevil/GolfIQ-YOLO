import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetRunsUploadStateForTests,
  __setRunsUploadStorageForTests,
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

declare global {
  // eslint-disable-next-line no-var
  var fetch: (input: any, init?: any) => Promise<any>;
}

const STORAGE_KEY = "runs.upload.queue.v1";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  const storage = createMemoryStorage();
  __setRunsUploadStorageForTests(storage);
  __resetRunsUploadStateForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  __setRunsUploadStorageForTests(null);
  __resetRunsUploadStateForTests();
});

describe("runs uploader", () => {
  it("uploads HUD payload and resolves receipt", async () => {
    const storage = createMemoryStorage();
    __setRunsUploadStorageForTests(storage);
    __resetRunsUploadStateForTests();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ id: "share-abc", url: "/runs/share-abc" }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const payload = [
      { timestampMs: 1, event: "hud.frame", data: { fps: 60 } },
      { timestampMs: 2, event: "hud.frame", data: { fps: 58 } },
    ];

    const receiptPromise = uploadHudRun(payload);
    await vi.advanceTimersByTimeAsync(0);
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
    __resetRunsUploadStateForTests();

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

    // allow initial attempt
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const stored = storage.store.get(STORAGE_KEY);
    expect(stored).toBeTruthy();
    if (!stored) throw new Error("Queue missing");
    const parsed = JSON.parse(stored) as { tasks: { attempts: number; nextAttemptAt: number }[] };
    expect(parsed.tasks[0]?.attempts).toBe(1);
    const nowAfterFailure = Date.now();
    expect(parsed.tasks[0]?.nextAttemptAt).toBe(nowAfterFailure + 4_000);

    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(0);

    const receipt = await receiptPromise;
    expect(receipt.id).toBe("share-retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(storage.store.has(STORAGE_KEY)).toBe(false);
  });

  it("persists queue across resets and resumes", async () => {
    const storage = createMemoryStorage();
    __setRunsUploadStorageForTests(storage);
    __resetRunsUploadStateForTests();

    const failingFetch = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", failingFetch);

    const pending = uploadRoundRun({ id: "round-1", holes: [] });
    await vi.advanceTimersByTimeAsync(0);
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
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(successFetch).toHaveBeenCalledTimes(1);
    const cleared = storage.store.get(STORAGE_KEY);
    expect(cleared).toBeUndefined();
  });
});

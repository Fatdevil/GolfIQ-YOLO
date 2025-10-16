import { describe, expect, it, vi } from "vitest";

import { createBundleClient } from "../bundle_client";

type FetchCall = { url: string; init?: RequestInit };

type MockResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
};

class MemoryFileSystem {
  public documentDirectory = "memory://";
  private store = new Map<string, string>();

  async getInfoAsync(path: string): Promise<{ exists: boolean; isFile: boolean; isDirectory: boolean }> {
    const exists = this.store.has(path);
    return { exists, isFile: exists, isDirectory: false };
  }

  async readAsStringAsync(path: string): Promise<string> {
    const value = this.store.get(path);
    if (value === undefined) {
      throw new Error("ENOENT");
    }
    return value;
  }

  async writeAsStringAsync(path: string, contents: string): Promise<void> {
    this.store.set(path, contents);
  }

  async deleteAsync(path: string): Promise<void> {
    this.store.delete(path);
  }

  async makeDirectoryAsync(): Promise<void> {}
}

function createFetchMock(responses: MockResponse[]) {
  const calls: FetchCall[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) {
      throw new Error("Unexpected fetch call");
    }
    const headerEntries = Object.entries(next.headers ?? {});
    const headerMap = new Map(headerEntries);
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      headers: {
        forEach: (callback: (value: string, key: string) => void) => {
          headerMap.forEach((value, key) => callback(value, key));
        },
      } as Headers,
      json: async () => next.body,
    } as unknown as Response;
  });
  return { fetchImpl, calls };
}

describe("bundle_client", () => {
  it("caches bundles with TTL and revalidates via ETag", async () => {
    let now = 0;
    const fs = new MemoryFileSystem();
    const { fetchImpl, calls } = createFetchMock([
      {
        status: 200,
        headers: {
          ETag: 'W/"1"',
          "Cache-Control": "public, max-age=60",
        },
        body: { courseId: "demo", version: 1, ttlSec: 60, features: [] },
      },
      {
        status: 304,
        headers: {
          "Cache-Control": "public, max-age=120",
        },
      },
    ]);

    const client = createBundleClient({
      fetchFn: fetchImpl as unknown as typeof fetch,
      now: () => now,
      fileSystem: fs,
    });

    const first = await client.getBundle("demo");
    expect(first.courseId).toBe("demo");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now = 30_000;
    const second = await client.getBundle("demo");
    expect(second).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now = 61_000;
    const third = await client.getBundle("demo");
    expect(third.courseId).toBe("demo");
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const headers = calls[1].init?.headers as Record<string, string> | undefined;
    const conditional = headers?.["If-None-Match"] ?? headers?.["if-none-match"];
    expect(conditional).toBe('W/"1"');

    // Allow background refresh to settle.
    await Promise.resolve();
    await Promise.resolve();

    const meta = client.getLastFetchInfo("demo");
    expect(meta).not.toBeNull();
    expect(meta?.fromCache).toBe(true);
  });
});

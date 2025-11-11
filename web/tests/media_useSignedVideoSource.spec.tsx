import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSignedVideoSource } from "../src/media/useSignedVideoSource";

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useSignedVideoSource", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (globalThis as { fetch?: unknown }).fetch;
    }
  });

  it("does not expose the raw URL before signing completes", async () => {
    const deferred = createDeferred<FetchResponse>();
    const fetchMock = vi.fn().mockReturnValue(deferred.promise);
    vi.stubGlobal("fetch", fetchMock);

    const signedUrl = "https://cdn.example.com/hls/c1/master.m3u8?sig=abc";

    const { result } = renderHook(() => useSignedVideoSource("/hls/c1/master.m3u8"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/media/sign?path=%2Fhls%2Fc1%2Fmaster.m3u8");
    expect(result.current.url).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => {
      deferred.resolve({
        ok: true,
        status: 200,
        json: async () => ({ url: signedUrl, exp: 123 }),
      });
      await Promise.resolve();
    });

    expect(result.current.url).toBe(signedUrl);
    expect(result.current.signed).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("resets to pending state immediately when the raw URL changes", async () => {
    const first = createDeferred<FetchResponse>();
    const second = createDeferred<FetchResponse>();
    const fetchMock = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useSignedVideoSource(url),
      {
        initialProps: { url: "/hls/a/master.m3u8" },
      },
    );

    await act(async () => {
      first.resolve({
        ok: true,
        status: 200,
        json: async () => ({ url: "signed-a", exp: 10 }),
      });
      await Promise.resolve();
    });

    expect(result.current.url).toBe("signed-a");
    expect(result.current.loading).toBe(false);

    await act(async () => {
      rerender({ url: "/hls/b/master.m3u8" });
    });

    expect(result.current.url).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => {
      second.resolve({
        ok: true,
        status: 200,
        json: async () => ({ url: "signed-b", exp: 20 }),
      });
      await Promise.resolve();
    });

    expect(result.current.url).toBe("signed-b");
    expect(result.current.loading).toBe(false);
  });

  it("falls back to the raw URL when dev fallback is enabled", async () => {
    vi.stubEnv("VITE_MEDIA_SIGN_DEV_FALLBACK", "true");

    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: "nope" }) });
    vi.stubGlobal("fetch", fetchMock);

    const rawUrl = "/hls/fallback/master.m3u8";

    const { result } = renderHook(() => useSignedVideoSource(rawUrl));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.url).toBe(rawUrl);
    expect(result.current.signed).toBe(false);
    expect(result.current.error).toBe("fallback");
    expect(result.current.loading).toBe(false);
  });
});

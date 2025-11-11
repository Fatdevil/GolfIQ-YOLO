import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchHomeFeed, __testing } from "@web/features/feed/api";

describe("fetchHomeFeed", () => {
  const spy = vi.spyOn(axios, "get");

  afterEach(() => {
    spy.mockReset();
    __testing.clearCache();
  });

  it("reuses cached payload when the server returns 304", async () => {
    const payload = {
      topShots: [],
      live: [],
      updatedAt: "2024-01-04T09:00:00Z",
      etag: "etag-1",
    };

    spy.mockResolvedValueOnce({
      status: 200,
      data: payload,
      headers: { etag: "etag-1" },
    } as never);

    const first = await fetchHomeFeed();
    expect(first).toEqual(payload);
    const firstHeaders = spy.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
    expect(firstHeaders?.["If-None-Match"]).toBeUndefined();

    spy.mockResolvedValueOnce({
      status: 304,
      data: undefined,
      headers: { etag: "etag-1" },
    } as never);

    const second = await fetchHomeFeed();
    expect(second).toEqual(payload);
    const secondHeaders = spy.mock.calls[1]?.[1]?.headers as Record<string, string> | undefined;
    expect(secondHeaders?.["If-None-Match"]).toBe("etag-1");
  });
});

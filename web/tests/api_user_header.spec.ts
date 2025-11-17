import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/user/currentUserId", () => ({
  getCurrentUserId: () => "u-test",
}));

const fetchMock = vi.fn();

afterEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
});

global.fetch = fetchMock as unknown as typeof fetch;

describe("apiFetch", () => {
  it("includes x-user-id header when available", async () => {
    const { apiFetch, API } = await import("@/api");
    fetchMock.mockResolvedValue({ ok: true } as Response);

    await apiFetch("/dummy", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/dummy`,
      expect.objectContaining({
        headers: expect.objectContaining({ "x-user-id": "u-test" }),
      })
    );
  });
});

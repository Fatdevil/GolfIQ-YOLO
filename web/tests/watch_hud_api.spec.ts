import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/user/currentUserId", () => ({
  getCurrentUserId: () => undefined,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("watch HUD api client", () => {
  it("posts HUD queries with auth headers", async () => {
    const responsePayload = { hole: 1, toFront_m: 120 };
    const postSpy = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ data: responsePayload } as never);

    const { getHoleHud, API } = await import("@/api");
    const query = { hole: 1, courseId: "links_crest", lat: 56.41, lon: -2.79 };

    const result = await getHoleHud(query);

    expect(result).toEqual(responsePayload);
    expect(postSpy).toHaveBeenCalledWith(
      `${API}/api/watch/hud/hole`,
      query,
      { headers: expect.objectContaining({ "Content-Type": "application/json" }) },
    );
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { createTripShareToken, TripApiError } from "../src/trip/api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createTripShareToken", () => {
  it("returns the issued public token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ publicToken: "abc123" }),
      } as unknown as Response);

    const token = await createTripShareToken("trip_1");

    expect(token).toBe("abc123");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/trip/rounds/trip_1/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("throws TripApiError on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as unknown as Response);

    await expect(createTripShareToken("trip_2")).rejects.toBeInstanceOf(
      TripApiError
    );
  });
});

import { describe, expect, it, vi } from "vitest";

import { detectHole } from "../src/api/holeDetect";

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock("axios", () => ({
  default: {
    post: postMock,
  },
}));

describe("detectHole API helper", () => {
  it("posts to /api/hole/detect with the request body", async () => {
    postMock.mockResolvedValue({
      data: {
        hole: 5,
        distance_m: 87,
        confidence: 0.93,
        reason: "closest_tee",
      },
    });

    const result = await detectHole({
      courseId: "hero-1",
      lat: 10.5,
      lon: 20.4,
      lastHole: 3,
    });

    expect(postMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/hole/detect",
      {
        courseId: "hero-1",
        lat: 10.5,
        lon: 20.4,
        lastHole: 3,
      },
      expect.objectContaining({ headers: expect.any(Object) })
    );
    expect(result).toEqual({
      hole: 5,
      distance_m: 87,
      confidence: 0.93,
      reason: "closest_tee",
    });
  });
});

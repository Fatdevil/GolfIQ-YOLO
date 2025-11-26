import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/api", () => ({
  API: "http://localhost:8000",
  withAuth: () => ({ "x-api-key": "demo-key" }),
}));

import { fetchSgPreview, type RoundSgPreview } from "../src/api/sgPreview";
import { API, withAuth } from "../src/api";

describe("sg preview api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches preview data for a run", async () => {
    const payload: RoundSgPreview = {
      runId: "run-123",
      courseId: "course-1",
      total_sg: 0.8,
      sg_by_cat: { TEE: -0.2, APPROACH: 0.4, SHORT: 0.1, PUTT: 0.5 },
      holes: [],
    };

    const getSpy = vi
      .spyOn(axios, "get")
      .mockResolvedValue({ data: payload } as never);

    const result = await fetchSgPreview("run-123");

    expect(result).toEqual(payload);
    expect(getSpy).toHaveBeenCalledWith(`${API}/api/sg/run/run-123`, {
      headers: withAuth(),
    });
  });
});


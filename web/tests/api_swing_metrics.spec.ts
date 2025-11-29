import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient, fetchSwingMetrics, type SwingMetricsResponse } from "../src/api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchSwingMetrics", () => {
  it("requests swing metrics for a run", async () => {
    const mockResponse: SwingMetricsResponse = {
      runId: "run-123",
      club: "Driver",
      metrics: {
        max_shoulder_rotation: { value: 80, units: "deg" },
      },
      tour_compare: {
        max_shoulder_rotation: {
          bandGroup: "driver",
          status: "in_range",
          rangeMin: 75,
          rangeMax: 95,
        },
      },
    };

    const spy = vi.spyOn(apiClient, "get").mockResolvedValue({ data: mockResponse } as never);

    const result = await fetchSwingMetrics("run-123");

    expect(result).toEqual(mockResponse);
    expect(spy).toHaveBeenCalledWith(`/api/swing/run-123/metrics`);
  });
});

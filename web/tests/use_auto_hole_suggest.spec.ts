import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutoHoleSuggest } from "../src/features/quickround/useAutoHoleSuggest";

const { detectHoleMock } = vi.hoisted(() => ({ detectHoleMock: vi.fn() }));

vi.mock("../src/api/holeDetect", () => ({
  detectHole: detectHoleMock,
}));

describe("useAutoHoleSuggest", () => {
  const originalNavigator = (globalThis as { navigator?: Navigator }).navigator;

  afterAll(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
      });
    }
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("stays idle when disabled or missing inputs", () => {
    const { result: disabled } = renderHook(() =>
      useAutoHoleSuggest({ enabled: false, courseId: "c1", lat: 1, lon: 1 })
    );

    const { result: missingCourse } = renderHook(() =>
      useAutoHoleSuggest({ enabled: true, lat: 1, lon: 1 })
    );

    expect(disabled.current).toEqual({ status: "idle" });
    expect(missingCourse.current).toEqual({ status: "idle" });
    expect(detectHoleMock).not.toHaveBeenCalled();
  });

  it("transitions to suggested when detectHole resolves", async () => {
    detectHoleMock.mockResolvedValue({
      hole: 6,
      distance_m: 120,
      confidence: 0.88,
      reason: "closest_green",
    });

    const { result } = renderHook(() =>
      useAutoHoleSuggest({
        enabled: true,
        courseId: "hero-1",
        lastHole: 5,
        lat: 59.3,
        lon: 18.1,
      })
    );

    await waitFor(() => {
      expect(result.current.status).toBe("suggested");
    });

    expect(result.current).toEqual({
      status: "suggested",
      suggestion: {
        hole: 6,
        distance_m: 120,
        confidence: 0.88,
        reason: "closest_green",
      },
    });
    expect(detectHoleMock).toHaveBeenCalledWith({
      courseId: "hero-1",
      lat: 59.3,
      lon: 18.1,
      lastHole: 5,
    });
  });

  it("reports error state when detectHole rejects", async () => {
    detectHoleMock.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() =>
      useAutoHoleSuggest({
        enabled: true,
        courseId: "hero-2",
        lat: 1,
        lon: 2,
      })
    );

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
  });
});

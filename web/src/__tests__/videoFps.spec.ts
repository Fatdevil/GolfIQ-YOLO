import { describe, expect, it } from "vitest";

import { estimateFpsFromTimes } from "@/lib/videoFps";

describe("estimateFpsFromTimes", () => {
  it("estimates fps from median deltas", () => {
    const times = [0, 1 / 60, 2 / 60, 3 / 60, 4 / 60];
    const estimate = estimateFpsFromTimes(times, "seeked");
    expect(estimate.value).toBeCloseTo(60, 2);
    expect(estimate.confidence).toBe("high");
  });

  it("returns low confidence for coarse deltas", () => {
    const times = [0, 0.25, 0.5, 0.75];
    const estimate = estimateFpsFromTimes(times, "seeked");
    expect(estimate.value).toBeUndefined();
    expect(estimate.confidence).toBe("low");
  });

  it("returns low confidence for zero deltas", () => {
    const times = [1, 1, 1, 1];
    const estimate = estimateFpsFromTimes(times, "seeked");
    expect(estimate.value).toBeUndefined();
    expect(estimate.confidence).toBe("low");
  });
});

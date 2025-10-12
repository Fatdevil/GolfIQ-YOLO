import { describe, expect, it } from "vitest";

import { DEFAULT_ARHUD_SLOS } from "../constants";
import { HeadingSmoother } from "../heading_smoother";

const timestamp = () => Date.now();

describe("HeadingSmoother", () => {
  it("smooths wrap-around transitions without spikes", () => {
    const smoother = new HeadingSmoother({ alpha: 0.3, rmsWindow: 6 });
    const samples = [350, 355, 359, 2, 5, 8];
    let last = 0;
    samples.forEach((heading) => {
      last = smoother.update({ headingDeg: heading, timestampMs: timestamp() });
    });
    const wrapDiff = Math.abs((((last - 356 + 540) % 360) + 360) % 360 - 180);
    expect(wrapDiff).toBeLessThan(12);
    expect(smoother.isWithinBudget(DEFAULT_ARHUD_SLOS.trackingHeadingRmsMax * 3)).toBe(true);
  });

  it("computes RMS budget across rolling window", () => {
    const smoother = new HeadingSmoother({ alpha: 0.25, rmsWindow: 4 });
    const base = 120;
    const noises = [0, 1, -1, 2, -2, 0, 0.5, -0.5];
    noises.forEach((noise, index) => {
      smoother.update({ headingDeg: base + noise, timestampMs: timestamp() + index });
    });
    expect(smoother.rms).toBeGreaterThan(0);
    expect(smoother.isWithinBudget(3)).toBe(true);
    expect(smoother.isWithinBudget(0.1)).toBe(false);
  });
});

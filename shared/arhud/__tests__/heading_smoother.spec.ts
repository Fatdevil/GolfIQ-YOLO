import { describe, expect, it } from "vitest";

import { HEADING_RMS_MAX_DEG } from "../constants";
import { createHeadingSmoother } from "../heading_smoother";

describe("heading smoother", () => {
  it("handles wrap-around without jumping across the circle", () => {
    const smoother = createHeadingSmoother({ alpha: 0.5 });
    expect(smoother.next(358)).toBeCloseTo(358, 5);
    const wrapped = smoother.next(2);
    expect(wrapped === 0 || wrapped === 360 ? 0 : wrapped).toBeCloseTo(0, 5);

    const followUp = smoother.next(4);
    expect(followUp).toBeGreaterThanOrEqual(0);
    expect(followUp).toBeLessThan(10);
  });

  it("keeps RMS error within the heading budget for stable data", () => {
    const smoother = createHeadingSmoother({ alpha: 0.25, window: 32 });
    const samples = [
      0,
      1,
      359,
      0.5,
      0,
      1.5,
      358.5,
      0.2,
      0.8,
      359.5,
    ];

    for (let i = 0; i < 5; i += 1) {
      samples.forEach((sample) => {
        smoother.next(sample);
      });
    }

    expect(smoother.rms()).toBeLessThanOrEqual(HEADING_RMS_MAX_DEG);
  });

  it("resets to forget historical state", () => {
    const smoother = createHeadingSmoother();
    smoother.next(90);
    smoother.next(100);
    expect(smoother.rms()).toBeGreaterThanOrEqual(0);

    smoother.reset();
    expect(smoother.next(45)).toBeCloseTo(45, 5);
    expect(smoother.rms()).toBeLessThanOrEqual(HEADING_RMS_MAX_DEG);
  });
});

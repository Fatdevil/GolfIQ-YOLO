import { describe, expect, it } from "vitest";

import { HEADING_RMS_MAX_DEG } from "../constants";
import { createHeadingSmoother } from "../heading_smoother";

describe("createHeadingSmoother", () => {
  it("smooths across the 0/360 wrap without jumping", () => {
    const smoother = createHeadingSmoother({ alpha: 0.25 });
    const first = smoother.next(358);
    expect(first).toBeGreaterThan(340);

    const second = smoother.next(2);
    const distanceToZero = Math.min(second, Math.abs(360 - second));
    expect(distanceToZero).toBeLessThan(20);
  });

  it("tracks small perturbations within the RMS budget", () => {
    const smoother = createHeadingSmoother({ window: 16 });
    const samples = [0, 0.6, 359.4, 1, 358.8, 0.3, 359.7, 0.9, 0.4, 359.6];
    for (const heading of samples) {
      smoother.next(heading);
    }
    expect(smoother.rms()).toBeLessThanOrEqual(HEADING_RMS_MAX_DEG + 0.05);
  });

  it("resets accumulated state", () => {
    const smoother = createHeadingSmoother();
    smoother.next(90);
    expect(smoother.rms()).toBe(0);

    smoother.reset();
    expect(smoother.next(270)).toBeGreaterThan(200);
  });
});

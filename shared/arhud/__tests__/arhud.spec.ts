import { describe, expect, it } from "vitest";

import { HEADING_RMS_MAX_DEG } from "../constants";
import { createHeadingSmoother } from "../heading_smoother";
import { createArhudStateMachine } from "../state_machine";

describe("AR-HUD state machine", () => {
  it("follows the happy path and supports recenter loop", () => {
    const machine = createArhudStateMachine();
    expect(machine.current()).toBe("AIM");

    expect(machine.dispatch("aimAcquired")).toBe("CALIBRATE");
    expect(machine.dispatch("calibrated")).toBe("TRACK");
    expect(machine.dispatch("recenterRequested")).toBe("RECENTER");
    expect(machine.dispatch("recentered")).toBe("TRACK");
    expect(machine.dispatch("trackingLost")).toBe("AIM");
  });

  it("guards against illegal transitions", () => {
    const machine = createArhudStateMachine();
    expect(machine.dispatch("calibrated")).toBe("AIM");
    expect(machine.dispatch("recentered")).toBe("AIM");

    machine.dispatch("aimAcquired");
    machine.dispatch("calibrated");
    expect(machine.current()).toBe("TRACK");
    expect(machine.dispatch("recentered")).toBe("TRACK");

    machine.reset();
    expect(machine.current()).toBe("AIM");
  });
});

describe("heading smoother", () => {
  it("handles wrap-around without jumping across the circle", () => {
    const smoother = createHeadingSmoother({ alpha: 0.5 });
    const first = smoother.next(358);
    expect(first).toBeCloseTo(358, 6);
    const second = smoother.next(2);
    expect(second).toBeLessThan(10);
  });

  it("keeps RMS noise within budget under steady input", () => {
    const smoother = createHeadingSmoother();
    for (let i = 0; i < 50; i += 1) {
      smoother.next(90);
    }
    expect(smoother.rms()).toBeLessThanOrEqual(HEADING_RMS_MAX_DEG);
  });
});

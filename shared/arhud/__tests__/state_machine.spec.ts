import { describe, expect, it } from "vitest";

import { createStateMachine } from "../state_machine";

describe("AR-HUD state machine", () => {
  it("follows the happy path and recenter loop", () => {
    const fsm = createStateMachine();
    expect(fsm.current()).toBe("AIM");

    expect(fsm.dispatch("aimAcquired")).toBe("CALIBRATE");
    expect(fsm.dispatch("calibrated")).toBe("TRACK");

    expect(fsm.dispatch("recenterRequested")).toBe("RECENTER");
    expect(fsm.dispatch("recentered")).toBe("TRACK");

    expect(fsm.dispatch("trackingLost")).toBe("AIM");
    expect(fsm.current()).toBe("AIM");
  });

  it("guards against illegal transitions", () => {
    const fsm = createStateMachine();
    expect(fsm.current()).toBe("AIM");

    fsm.dispatch("calibrated");
    expect(fsm.current()).toBe("AIM");

    fsm.dispatch("recenterRequested");
    expect(fsm.current()).toBe("AIM");

    fsm.dispatch("aimAcquired");
    expect(fsm.current()).toBe("CALIBRATE");

    fsm.dispatch("recenterRequested");
    expect(fsm.current()).toBe("CALIBRATE");

    fsm.dispatch("trackingLost");
    expect(fsm.current()).toBe("AIM");
  });

  it("resets to AIM", () => {
    const fsm = createStateMachine();
    fsm.dispatch("aimAcquired");
    fsm.dispatch("calibrated");
    expect(fsm.current()).toBe("TRACK");

    fsm.reset();
    expect(fsm.current()).toBe("AIM");
  });
});

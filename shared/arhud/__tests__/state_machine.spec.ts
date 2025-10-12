import { describe, expect, it } from "vitest";

import { createHudStateMachine, hudInitialState } from "../state_machine";

describe("createHudStateMachine", () => {
  it("follows AIM → CALIBRATE → TRACK happy path", () => {
    const fsm = createHudStateMachine();
    expect(fsm.current()).toBe(hudInitialState);

    fsm.dispatch("aimAcquired");
    expect(fsm.current()).toBe("CALIBRATE");

    fsm.dispatch("calibrated");
    expect(fsm.current()).toBe("TRACK");

    fsm.dispatch("recenterRequested");
    expect(fsm.current()).toBe("RECENTER");

    fsm.dispatch("recentered");
    expect(fsm.current()).toBe("TRACK");

    fsm.dispatch("trackingLost");
    expect(fsm.current()).toBe("CALIBRATE");
  });

  it("rejects illegal transitions without mutating state", () => {
    const fsm = createHudStateMachine();

    fsm.dispatch("calibrated");
    expect(fsm.current()).toBe("AIM");

    fsm.dispatch("recenterRequested");
    expect(fsm.current()).toBe("AIM");

    fsm.dispatch("aimAcquired");
    expect(fsm.current()).toBe("CALIBRATE");

    fsm.dispatch("recentered");
    expect(fsm.current()).toBe("CALIBRATE");

    fsm.dispatch("trackingLost");
    expect(fsm.current()).toBe("AIM");

    fsm.dispatch("trackingLost");
    expect(fsm.current()).toBe("AIM");
  });

  it("resets to initial state", () => {
    const fsm = createHudStateMachine();
    fsm.dispatch("aimAcquired");
    fsm.dispatch("calibrated");
    expect(fsm.current()).toBe("TRACK");

    fsm.reset();
    expect(fsm.current()).toBe("AIM");
  });
});

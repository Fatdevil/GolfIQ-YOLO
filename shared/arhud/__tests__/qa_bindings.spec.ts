import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HEADING_RMS_MAX_DEG,
  RECENTER_MAX_S,
} from "../constants";
import { createHeadingSmoother } from "../heading_smoother";
import { createArhudStateMachine } from "../state_machine";
import {
  __setHeadingSourceForTests,
  subscribeHeading,
} from "../native/heading";
import { createCameraStub } from "../native/camera_stub";

afterEach(() => {
  __setHeadingSourceForTests(null);
  vi.useRealTimers();
});

describe("QA HUD bindings", () => {
  it("keeps heading RMS within budget for steady mocked stream", () => {
    const smoother = createHeadingSmoother();
    const subscribers: Array<(deg: number) => void> = [];

    __setHeadingSourceForTests((cb) => {
      subscribers.push(cb);
      return () => {
        const index = subscribers.indexOf(cb);
        if (index >= 0) {
          subscribers.splice(index, 1);
        }
      };
    });

    const unsubscribe = subscribeHeading((deg) => {
      smoother.next(deg);
    });

    for (let i = 0; i < 60; i += 1) {
      subscribers.forEach((cb) => cb(270));
    }

    expect(smoother.rms()).toBeLessThanOrEqual(HEADING_RMS_MAX_DEG);

    unsubscribe();
  });

  it("recovers from tracking loss and completes recenter under budget", async () => {
    vi.useFakeTimers();
    const machine = createArhudStateMachine();

    expect(machine.current()).toBe("AIM");
    machine.dispatch("aimAcquired");
    machine.dispatch("calibrated");
    expect(machine.current()).toBe("TRACK");

    machine.dispatch("trackingLost");
    expect(machine.current()).toBe("AIM");

    machine.dispatch("aimAcquired");
    machine.dispatch("calibrated");
    expect(machine.current()).toBe("TRACK");

    const camera = createCameraStub({ recenterDurationMs: 500 });
    await camera.start(() => {});

    machine.dispatch("recenterRequested");
    expect(machine.current()).toBe("RECENTER");

    const recenterPromise = camera.requestRecenter();
    vi.advanceTimersByTime(800);
    const elapsedMs = await recenterPromise;

    machine.dispatch("recentered");
    expect(machine.current()).toBe("TRACK");

    expect(elapsedMs).toBeLessThanOrEqual(RECENTER_MAX_S * 1000);

    camera.stop();
  });
});

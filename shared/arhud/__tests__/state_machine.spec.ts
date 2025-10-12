import { describe, expect, it } from "vitest";

import { DEFAULT_ARHUD_SLOS } from "../constants";
import { ArhudStateMachine } from "../state_machine";

describe("ArhudStateMachine", () => {
  it("walks through aim → calibrate → track → aim loop", () => {
    const machine = new ArhudStateMachine();
    expect(machine.currentState).toBe("aim");
    machine.beginCalibration({ poseVariance: DEFAULT_ARHUD_SLOS.aimPoseVarianceMax / 2 });
    expect(machine.currentState).toBe("calibrate");
    machine.completeCalibration({ headingRms: DEFAULT_ARHUD_SLOS.calibrationHeadingRmsMax / 2, timestampMs: 1_000 });
    expect(machine.currentState).toBe("track");
    machine.requestRecenter();
    expect(machine.currentState).toBe("aim");
  });

  it("enforces SLO guards for calibration", () => {
    const machine = new ArhudStateMachine();
    expect(() =>
      machine.beginCalibration({
        poseVariance: DEFAULT_ARHUD_SLOS.aimPoseVarianceMax * 2,
      }),
    ).toThrow(/pose instability/);
    machine.beginCalibration({ poseVariance: DEFAULT_ARHUD_SLOS.aimPoseVarianceMax / 4 });
    expect(() =>
      machine.completeCalibration({
        headingRms: DEFAULT_ARHUD_SLOS.calibrationHeadingRmsMax * 2,
        timestampMs: 1,
      }),
    ).toThrow(/outside SLO/);
  });

  it("forces recenter when heading quality drifts or stale calibration", () => {
    const machine = new ArhudStateMachine({ ...DEFAULT_ARHUD_SLOS, recenterGraceMs: 50 });
    machine.beginCalibration({ poseVariance: 0 });
    machine.completeCalibration({ headingRms: 0.5, timestampMs: 0 });
    expect(machine.currentState).toBe("track");
    machine.updateTracking({ headingRms: DEFAULT_ARHUD_SLOS.trackingHeadingRmsMax + 1, timestampMs: 25 });
    expect(machine.currentState).toBe("aim");

    machine.beginCalibration({ poseVariance: 0 });
    machine.completeCalibration({ headingRms: 0.5, timestampMs: 0 });
    expect(machine.currentState).toBe("track");
    machine.updateTracking({ headingRms: 0.5, timestampMs: 100 });
    expect(machine.currentState).toBe("aim");
  });

  it("rejects illegal transitions", () => {
    const machine = new ArhudStateMachine();
    expect(() => machine.completeCalibration({ headingRms: 0.5, timestampMs: 0 })).toThrow(
      /cannot complete calibration/,
    );
    machine.beginCalibration({ poseVariance: 0 });
    machine.completeCalibration({ headingRms: 0.5, timestampMs: 0 });
    expect(() => machine.beginCalibration({ poseVariance: 0 })).toThrow(/cannot begin calibration/);
    expect(() => machine.updateTracking({ headingRms: 0.5, timestampMs: 10 })).not.toThrow();
  });
});

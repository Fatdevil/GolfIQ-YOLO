import { DEFAULT_ARHUD_SLOS } from "./constants";

export type ArhudState = "aim" | "calibrate" | "track";

export type PoseStatus = {
  poseVariance: number;
};

export type CalibrationStatus = {
  headingRms: number;
  timestampMs?: number;
};

export type TrackingStatus = {
  headingRms: number;
  timestampMs: number;
};

export class ArhudStateMachine {
  private state: ArhudState = "aim";
  private lastCalibratedAt: number | null = null;

  constructor(private readonly slos = DEFAULT_ARHUD_SLOS) {}

  get currentState(): ArhudState {
    return this.state;
  }

  canBeginCalibration(pose: PoseStatus): boolean {
    return pose.poseVariance <= this.slos.aimPoseVarianceMax;
  }

  beginCalibration(pose: PoseStatus): ArhudState {
    if (this.state !== "aim") {
      throw new Error(`cannot begin calibration from ${this.state}`);
    }
    if (!this.canBeginCalibration(pose)) {
      throw new Error("pose instability prevents calibration");
    }
    this.state = "calibrate";
    return this.state;
  }

  canCompleteCalibration(result: CalibrationStatus): boolean {
    return result.headingRms <= this.slos.calibrationHeadingRmsMax;
  }

  completeCalibration(result: CalibrationStatus): ArhudState {
    if (this.state !== "calibrate") {
      throw new Error(`cannot complete calibration from ${this.state}`);
    }
    if (!this.canCompleteCalibration(result)) {
      throw new Error("calibration quality outside SLO");
    }
    this.state = "track";
    this.lastCalibratedAt = result.timestampMs ?? Date.now();
    return this.state;
  }

  updateTracking(status: TrackingStatus): ArhudState {
    if (this.state !== "track") {
      throw new Error("tracking updates are only valid in track state");
    }
    if (status.headingRms > this.slos.trackingHeadingRmsMax) {
      this.state = "aim";
      return this.state;
    }
    if (
      this.lastCalibratedAt !== null &&
      status.timestampMs - this.lastCalibratedAt > this.slos.recenterGraceMs
    ) {
      this.state = "aim";
      return this.state;
    }
    return this.state;
  }

  requestRecenter(): ArhudState {
    if (this.state !== "track") {
      throw new Error("recenter only allowed while tracking");
    }
    this.state = "aim";
    return this.state;
  }

  reset(): void {
    this.state = "aim";
    this.lastCalibratedAt = null;
  }
}

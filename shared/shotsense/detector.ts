import {
  DetectorOpts,
  GpsContext,
  IMUFrame,
  ShotCandidate,
  ShotSenseEvent,
} from './types';

type ProcessedFrame = {
  frame: IMUFrame;
  accelMag: number;
  gyroMag: number;
  jerk: number;
};

type BurstState = {
  startTs: number;
  lastTs: number;
  lastActiveTs: number;
  peakTs: number;
  peakGyro: number;
  peakAccel: number;
  peakJerk: number;
};

type PendingCandidate = ShotCandidate & { deadline: number };

const DEFAULT_OPTS: Required<DetectorOpts> = {
  sampleHz: 80,
  swingGyroPeak_degps: 450,
  swingAccelPeak_ms2: 20,
  jerkThresh_ms3: 180,
  minSwingWindow_ms: 250,
  debounce_ms: 2500,
  gateOnGreen: true,
  minMoveAfter_ms: 800,
  minMoveAfter_m: 3,
};

const MOVEMENT_SPEED_THRESHOLD = 0.8; // m/s ~1.8 mph

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const magnitude3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

const clampHz = (hz: number) =>
  Number.isFinite(hz) ? Math.max(20, Math.min(200, Math.round(hz))) : 80;

const msToSamples = (ms: number, hz: number) =>
  Math.max(1, Math.round((ms * hz) / 1000));

export class ShotDetector {
  private readonly opts: Required<DetectorOpts>;
  private sampleHz: number;
  private frameDtMs: number;
  private minSwingWinSamples: number;
  private debounceSamples: number;
  private settleSamples: number;
  private readonly startGyro: number;
  private readonly startAccel: number;
  private readonly startJerk: number;
  private readonly maxBufferMs: number;
  private readonly gpsRetentionMs: number;

  private buffer: ProcessedFrame[] = [];
  private gpsBuffer: GpsContext[] = [];
  private lastProcessed?: ProcessedFrame;
  private currentBurst?: BurstState;
  private lastEventTs = -Infinity;
  private pendingCandidate?: PendingCandidate;
  private queuedEvent?: ShotSenseEvent;
  private lastGps?: GpsContext;

  constructor(opts: DetectorOpts = {}) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
    this.sampleHz = clampHz(this.opts.sampleHz);
    this.opts.sampleHz = this.sampleHz;
    this.recomputeSampleWindows();
    this.startGyro = this.opts.swingGyroPeak_degps * 0.6;
    this.startAccel = this.opts.swingAccelPeak_ms2 * 0.6;
    this.startJerk = this.opts.jerkThresh_ms3 * 0.6;
    this.maxBufferMs = Math.max(3000, this.opts.minSwingWindow_ms * 4);
    this.gpsRetentionMs = Math.max(5000, this.opts.minMoveAfter_ms * 2);
  }

  setSampleHz(hz: number): void {
    const next = clampHz(hz);
    if (next === this.sampleHz) {
      return;
    }
    this.sampleHz = next;
    this.opts.sampleHz = this.sampleHz;
    this.recomputeSampleWindows();
    (this as any).resetRollingPeaks?.();
  }

  pushIMU(frame: IMUFrame): ShotSenseEvent[] {
    const events: ShotSenseEvent[] = [];

    if (this.queuedEvent) {
      events.push(this.queuedEvent);
      this.queuedEvent = undefined;
    }

    const processed = this.processFrame(frame);
    this.buffer.push(processed);
    this.lastProcessed = processed;
    this.trimBuffers(frame.ts);

    this.advanceState(processed, events);
    this.evaluatePending(frame.ts, events);

    return events;
  }

  pushGPS(ctx: GpsContext): void {
    this.lastGps = ctx;
    this.gpsBuffer.push(ctx);
    this.trimGps(ctx.ts);

    if (!this.pendingCandidate) {
      return;
    }

    if (ctx.ts > this.pendingCandidate.deadline) {
      this.pendingCandidate = undefined;
      return;
    }

    if (this.isMovementSatisfied(this.pendingCandidate, ctx.ts)) {
      this.finalizeEvent(this.pendingCandidate);
    }
  }

  reset(): void {
    this.buffer = [];
    this.gpsBuffer = [];
    this.lastProcessed = undefined;
    this.currentBurst = undefined;
    this.lastEventTs = -Infinity;
    this.pendingCandidate = undefined;
    this.queuedEvent = undefined;
    this.lastGps = undefined;
  }

  private processFrame(frame: IMUFrame): ProcessedFrame {
    const accelMag = magnitude3(frame.ax, frame.ay, frame.az);
    const gyroMag = magnitude3(frame.gx, frame.gy, frame.gz);

    let jerk = 0;
    if (this.lastProcessed) {
      const dtMs = frame.ts - this.lastProcessed.frame.ts;
      if (dtMs > 0) {
        const dtSeconds = dtMs / 1000;
        const prev = this.lastProcessed.frame;
        const diffAx = frame.ax - prev.ax;
        const diffAy = frame.ay - prev.ay;
        const diffAz = frame.az - prev.az;
        const deltaAccel = magnitude3(diffAx, diffAy, diffAz);
        jerk = deltaAccel / dtSeconds;
      }
    }

    return { frame, accelMag, gyroMag, jerk };
  }

  private trimBuffers(currentTs: number) {
    const minTs = currentTs - this.maxBufferMs;
    while (this.buffer.length && this.buffer[0].frame.ts < minTs) {
      this.buffer.shift();
    }
    this.trimGps(currentTs);
  }

  private trimGps(currentTs: number) {
    const minTs = currentTs - this.gpsRetentionMs;
    while (this.gpsBuffer.length && this.gpsBuffer[0].ts < minTs) {
      this.gpsBuffer.shift();
    }
  }

  private advanceState(processed: ProcessedFrame, events: ShotSenseEvent[]) {
    const { frame, accelMag, gyroMag, jerk } = processed;
    const activeNow =
      gyroMag >= this.startGyro ||
      accelMag >= this.startAccel ||
      jerk >= this.startJerk;

    if (!this.currentBurst && activeNow) {
      this.currentBurst = {
        startTs: frame.ts,
        lastTs: frame.ts,
        lastActiveTs: frame.ts,
        peakTs: frame.ts,
        peakGyro: gyroMag,
        peakAccel: accelMag,
        peakJerk: jerk,
      };
      return;
    }

    if (!this.currentBurst) {
      return;
    }

    this.currentBurst.lastTs = frame.ts;
    if (activeNow) {
      this.currentBurst.lastActiveTs = frame.ts;
    }

    if (gyroMag > this.currentBurst.peakGyro) {
      this.currentBurst.peakGyro = gyroMag;
      this.currentBurst.peakTs = frame.ts;
    }
    if (accelMag > this.currentBurst.peakAccel) {
      this.currentBurst.peakAccel = accelMag;
    }
    if (jerk > this.currentBurst.peakJerk) {
      this.currentBurst.peakJerk = jerk;
    }

    const idleMs = frame.ts - this.currentBurst.lastActiveTs;
    const idleSamples = Math.max(0, Math.round((idleMs * this.sampleHz) / 1000));
    if (idleSamples >= this.settleSamples) {
      this.maybeEmitCandidate(events);
      this.currentBurst = undefined;
    }
  }

  private maybeEmitCandidate(events: ShotSenseEvent[]) {
    if (!this.currentBurst) {
      return;
    }

    const windowMs = this.currentBurst.lastActiveTs - this.currentBurst.startTs;
    const windowSamples = Math.max(0, Math.round((windowMs * this.sampleHz) / 1000));
    if (windowSamples < this.minSwingWinSamples) {
      return;
    }

    const features = {
      gyroPeak: this.currentBurst.peakGyro,
      accelPeak: this.currentBurst.peakAccel,
      jerkPeak: this.currentBurst.peakJerk,
    };

    if (features.gyroPeak < this.opts.swingGyroPeak_degps) {
      return;
    }
    if (
      features.accelPeak < this.opts.swingAccelPeak_ms2 &&
      features.jerkPeak < this.opts.jerkThresh_ms3
    ) {
      return;
    }

    const candidate: ShotCandidate = {
      ts: this.currentBurst.peakTs,
      strength: this.computeStrength(features),
      features,
    };

    this.handleCandidate(candidate, events);
  }

  private handleCandidate(candidate: ShotCandidate, events: ShotSenseEvent[]) {
    if (this.lastEventTs !== -Infinity) {
      const sinceLastMs = candidate.ts - this.lastEventTs;
      const sinceLastSamples = Math.max(0, Math.round((sinceLastMs * this.sampleHz) / 1000));
      if (sinceLastSamples < this.debounceSamples) {
        return;
      }
    }

    if (candidate.ts - this.lastEventTs < this.opts.debounce_ms) {
      return;
    }

    if (this.opts.gateOnGreen && this.lastGps?.onGreen) {
      return;
    }

    if (this.opts.minMoveAfter_ms <= 0 || this.opts.minMoveAfter_m <= 0) {
      this.finalizeEvent(candidate, events);
      return;
    }

    if (this.isMovementSatisfied(candidate)) {
      this.finalizeEvent(candidate, events);
      return;
    }

    this.pendingCandidate = {
      ...candidate,
      deadline: candidate.ts + this.opts.minMoveAfter_ms,
    };
  }

  private finalizeEvent(candidate: ShotCandidate, events?: ShotSenseEvent[]) {
    const event: ShotSenseEvent = { kind: 'ShotDetected', at: candidate };
    this.pendingCandidate = undefined;
    this.lastEventTs = candidate.ts;

    if (events) {
      events.push(event);
      this.queuedEvent = undefined;
    } else {
      this.queuedEvent = event;
    }
  }

  private evaluatePending(currentTs: number, events: ShotSenseEvent[]) {
    if (!this.pendingCandidate) {
      return;
    }

    if (currentTs > this.pendingCandidate.deadline) {
      this.pendingCandidate = undefined;
      return;
    }

    if (this.isMovementSatisfied(this.pendingCandidate, currentTs)) {
      this.finalizeEvent(this.pendingCandidate, events);
    }
  }

  private isMovementSatisfied(candidate: PendingCandidate | ShotCandidate, horizonTs?: number): boolean {
    if (!this.gpsBuffer.length) {
      return false;
    }

    const windowEnd = candidate.ts + this.opts.minMoveAfter_ms;
    const limit = horizonTs ? Math.min(windowEnd, horizonTs) : windowEnd;
    if (limit <= candidate.ts) {
      return false;
    }

    const startCtx = this.findBaselineContext(candidate.ts);
    const relevant = this.gpsBuffer.filter(
      (ctx) => ctx.ts >= candidate.ts && ctx.ts <= limit,
    );

    if (!relevant.length) {
      return false;
    }

    const baseline = startCtx ?? relevant[0];

    for (const ctx of relevant) {
      if (ctx.speed_mps >= MOVEMENT_SPEED_THRESHOLD) {
        return true;
      }
      if (
        baseline?.distToGreen_m != null &&
        ctx.distToGreen_m != null &&
        Math.abs(ctx.distToGreen_m - baseline.distToGreen_m) >= this.opts.minMoveAfter_m
      ) {
        return true;
      }
    }

    return false;
  }

  private findBaselineContext(ts: number): GpsContext | undefined {
    for (let i = this.gpsBuffer.length - 1; i >= 0; i -= 1) {
      const ctx = this.gpsBuffer[i];
      if (ctx.ts <= ts) {
        return ctx;
      }
    }
    return undefined;
  }

  private computeStrength(features: ShotCandidate['features']): number {
    const gyroNorm = this.opts.swingGyroPeak_degps
      ? clamp01(features.gyroPeak / this.opts.swingGyroPeak_degps)
      : 0;
    const accelNorm = this.opts.swingAccelPeak_ms2
      ? clamp01(features.accelPeak / this.opts.swingAccelPeak_ms2)
      : 0;
    const jerkNorm = this.opts.jerkThresh_ms3
      ? clamp01(features.jerkPeak / this.opts.jerkThresh_ms3)
      : 0;

    const impact = Math.max(accelNorm, jerkNorm);
    return clamp01(0.55 * gyroNorm + 0.45 * impact);
  }

  private recomputeSampleWindows(): void {
    this.frameDtMs = 1000 / this.sampleHz;
    this.minSwingWinSamples = msToSamples(this.opts.minSwingWindow_ms, this.sampleHz);
    this.debounceSamples = msToSamples(this.opts.debounce_ms, this.sampleHz);
    const settleTargetMs = Math.max(80, Math.round(this.frameDtMs * 6));
    this.settleSamples = msToSamples(settleTargetMs, this.sampleHz);
  }
}

export type { DetectorOpts, GpsContext, IMUFrame, ShotCandidate, ShotSenseEvent } from './types';
export { msToSamples };

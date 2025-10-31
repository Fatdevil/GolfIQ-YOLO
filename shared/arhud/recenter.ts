import { deg, diffRad } from "./angles";

export type RecenterConfig = {
  lockThresholdDeg: number;
  stableMs: number;
  timeoutMs: number;
  maxDriftDeg: number;
};

export type LockState = "idle" | "seeking" | "locked" | "timeout";
export type Quality = "poor" | "fair" | "good" | "excellent";

export type RecenterEvent =
  | { type: "start"; now: number; yawRef: number }
  | { type: "sample"; now: number; yaw: number }
  | { type: "cancel"; now: number };

export type RecenterStatus = {
  state: LockState;
  quality: Quality;
  elapsedMs: number;
  errorDeg: number;
};

const DEFAULT_CONFIG: RecenterConfig = {
  lockThresholdDeg: 2,
  stableMs: 600,
  timeoutMs: 2000,
  maxDriftDeg: 4,
};

const QUALITY_THRESHOLDS: { limit: number; label: Quality }[] = [
  { limit: 0.5, label: "excellent" },
  { limit: 1.5, label: "good" },
  { limit: 3, label: "fair" },
];

type SamplePoint = { t: number; e: number };

export class RecenterController {
  private readonly cfg: RecenterConfig;
  private state: LockState = "idle";
  private yawRef = 0;
  private startTime = 0;
  private lockedAt: number | null = null;
  private stableSince: number | null = null;
  private readonly history: SamplePoint[] = [];
  private readonly windowMs = 300;
  private lastErrorDeg = 0;
  private currentStatus: RecenterStatus = {
    state: "idle",
    quality: "poor",
    elapsedMs: 0,
    errorDeg: 0,
  };

  constructor(cfg?: Partial<RecenterConfig>) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
  }

  start(now: number, yawRef: number): void {
    this.state = "seeking";
    this.yawRef = Number.isFinite(yawRef) ? yawRef : 0;
    this.startTime = Number.isFinite(now) ? now : 0;
    this.lockedAt = null;
    this.stableSince = null;
    this.history.length = 0;
    this.lastErrorDeg = 0;
    this.updateStatus(now, 0);
  }

  cancel(now: number): void {
    this.state = "idle";
    this.lockedAt = null;
    this.stableSince = null;
    this.history.length = 0;
    this.lastErrorDeg = 0;
    this.updateStatus(now, 0);
  }

  sample(now: number, yaw: number): RecenterStatus {
    const timestamp = Number.isFinite(now) ? now : this.startTime;
    if (this.state === "idle") {
      this.updateStatus(timestamp, this.lastErrorDeg);
      return this.currentStatus;
    }

    const errorDeg = Math.abs(deg(diffRad(yaw, this.yawRef)));
    this.lastErrorDeg = errorDeg;
    this.pushHistory({ t: timestamp, e: errorDeg });

    if (this.state === "seeking") {
      if (errorDeg <= this.cfg.lockThresholdDeg) {
        if (this.stableSince === null) {
          this.stableSince = timestamp;
        } else if (timestamp - this.stableSince >= this.cfg.stableMs) {
          this.state = "locked";
          this.lockedAt = timestamp;
        }
      } else {
        this.stableSince = null;
      }

      if (errorDeg > this.cfg.maxDriftDeg) {
        this.stableSince = null;
      }

      if (timestamp - this.startTime > this.cfg.timeoutMs) {
        if (this.state !== "locked") {
          this.state = "timeout";
        }
      }
    }

    this.updateStatus(timestamp, errorDeg);
    return this.currentStatus;
  }

  get status(): RecenterStatus {
    return this.currentStatus;
  }

  private pushHistory(sample: SamplePoint): void {
    this.history.push(sample);
    const cutoff = sample.t - this.windowMs;
    while (this.history.length > 0 && this.history[0].t < cutoff) {
      this.history.shift();
    }
  }

  private computeQuality(): Quality {
    if (!this.history.length) {
      return "poor";
    }
    const meanSquare =
      this.history.reduce((acc, point) => acc + point.e * point.e, 0) / this.history.length;
    const rms = Math.sqrt(meanSquare);
    for (const entry of QUALITY_THRESHOLDS) {
      if (rms <= entry.limit) {
        return entry.label;
      }
    }
    return "poor";
  }

  private updateStatus(now: number, errorDeg: number): void {
    const elapsedRaw = this.state === "idle" ? 0 : Math.max(0, now - this.startTime);
    const elapsedMs =
      this.state === "locked" && this.lockedAt !== null
        ? Math.max(0, this.lockedAt - this.startTime)
        : elapsedRaw;

    this.currentStatus = {
      state: this.state,
      quality: this.computeQuality(),
      elapsedMs,
      errorDeg,
    };
  }
}

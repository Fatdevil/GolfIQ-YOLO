import { HEADING_SMOOTHER_DEFAULTS } from "./constants";

export type HeadingSample = {
  headingDeg: number;
  timestampMs: number;
};

export type HeadingSmootherOptions = {
  alpha?: number;
  rmsWindow?: number;
};

function normalizeHeading(heading: number): number {
  const wrapped = heading % 360;
  if (wrapped < 0) {
    return wrapped + 360;
  }
  return wrapped;
}

function unwrapRelative(target: number, reference: number): number {
  let candidate = target;
  while (candidate - reference > 180) {
    candidate -= 360;
  }
  while (candidate - reference < -180) {
    candidate += 360;
  }
  return candidate;
}

export class HeadingSmoother {
  private readonly alpha: number;
  private readonly rmsWindow: number;
  private smoothedUnwrapped: number | null = null;
  private lastUnwrappedSample: number | null = null;
  private readonly residuals: number[] = [];

  constructor(options: HeadingSmootherOptions = {}) {
    this.alpha = options.alpha ?? HEADING_SMOOTHER_DEFAULTS.alpha;
    this.rmsWindow = Math.max(1, Math.trunc(options.rmsWindow ?? HEADING_SMOOTHER_DEFAULTS.rmsWindow));
  }

  reset(): void {
    this.smoothedUnwrapped = null;
    this.lastUnwrappedSample = null;
    this.residuals.length = 0;
  }

  update(sample: HeadingSample): number {
    const normalized = normalizeHeading(sample.headingDeg);
    const unwrapped =
      this.lastUnwrappedSample === null
        ? normalized
        : unwrapRelative(normalized, this.lastUnwrappedSample);

    this.lastUnwrappedSample = unwrapped;

    if (this.smoothedUnwrapped === null) {
      this.smoothedUnwrapped = unwrapped;
    } else {
      const delta = unwrapped - this.smoothedUnwrapped;
      this.smoothedUnwrapped += this.alpha * delta;
    }

    const residual = unwrapped - (this.smoothedUnwrapped ?? unwrapped);
    this.residuals.push(residual * residual);
    if (this.residuals.length > this.rmsWindow) {
      this.residuals.shift();
    }

    return normalizeHeading(this.smoothedUnwrapped ?? unwrapped);
  }

  get currentHeading(): number | null {
    if (this.smoothedUnwrapped === null) {
      return null;
    }
    return normalizeHeading(this.smoothedUnwrapped);
  }

  get rms(): number {
    if (!this.residuals.length) {
      return 0;
    }
    const mean = this.residuals.reduce((acc, value) => acc + value, 0) / this.residuals.length;
    return Math.sqrt(mean);
  }

  isWithinBudget(maxRms: number): boolean {
    return this.rms <= maxRms;
  }
}

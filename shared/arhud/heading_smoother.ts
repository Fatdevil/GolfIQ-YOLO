export interface HeadingSmootherOptions {
  alpha?: number;
  window?: number;
}

export interface HeadingSmoother {
  next: (deg: number) => number;
  rms: () => number;
  reset: () => void;
}

const DEFAULT_ALPHA = 0.2;
const DEFAULT_WINDOW = 24;

function normalizeHeading(deg: number): number {
  const normalized = ((deg % 360) + 360) % 360;
  return normalized === 360 ? 0 : normalized;
}

function shortestDelta(from: number, to: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return delta;
}

function clampAlpha(alpha: number | undefined): number {
  if (typeof alpha !== "number" || Number.isNaN(alpha)) {
    return DEFAULT_ALPHA;
  }
  if (alpha <= 0) {
    return DEFAULT_ALPHA;
  }
  if (alpha >= 1) {
    return 1;
  }
  return alpha;
}

function resolveWindow(windowSize: number | undefined): number {
  if (typeof windowSize !== "number" || Number.isNaN(windowSize)) {
    return DEFAULT_WINDOW;
  }
  return Math.max(1, Math.floor(windowSize));
}

export function createHeadingSmoother(
  opts: HeadingSmootherOptions = {}
): HeadingSmoother {
  const alpha = clampAlpha(opts.alpha);
  const windowSize = resolveWindow(opts.window);

  let smoothed: number | null = null;
  const errorBuffer: number[] = [];
  let sumOfSquares = 0;

  const recordError = (errorDeg: number) => {
    const squared = errorDeg * errorDeg;
    errorBuffer.push(squared);
    sumOfSquares += squared;
    if (errorBuffer.length > windowSize) {
      const removed = errorBuffer.shift();
      if (removed !== undefined) {
        sumOfSquares -= removed;
      }
    }
  };

  const next = (deg: number): number => {
    const target = normalizeHeading(deg);
    if (smoothed === null) {
      smoothed = target;
      recordError(0);
      return smoothed;
    }
    const delta = shortestDelta(smoothed, target);
    const candidate = smoothed + alpha * delta;
    smoothed = normalizeHeading(candidate);
    const residual = shortestDelta(smoothed, target);
    recordError(residual);
    return smoothed;
  };

  const rms = () => {
    if (errorBuffer.length === 0) {
      return 0;
    }
    return Math.sqrt(sumOfSquares / errorBuffer.length);
  };

  const reset = () => {
    smoothed = null;
    errorBuffer.length = 0;
    sumOfSquares = 0;
  };

  return { next, rms, reset };
}

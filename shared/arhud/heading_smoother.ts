const DEFAULT_ALPHA = 0.2;
const DEFAULT_WINDOW = 32;

export interface HeadingSmootherOptions {
  alpha?: number;
  window?: number;
}

function normalize(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function shortestDelta(target: number, source: number): number {
  let delta = target - source;
  delta = ((delta + 540) % 360) - 180;
  return delta;
}

export function createHeadingSmoother(
  opts: HeadingSmootherOptions = {},
): {
  next: (deg: number) => number;
  rms: () => number;
  reset: () => void;
} {
  const alpha = opts.alpha ?? DEFAULT_ALPHA;
  const window = Math.max(1, Math.floor(opts.window ?? DEFAULT_WINDOW));

  let smoothed = 0;
  let initialized = false;
  const residuals: number[] = [];

  const pushResidual = (value: number) => {
    residuals.push(value);
    if (residuals.length > window) {
      residuals.shift();
    }
  };

  return {
    next: (deg: number) => {
      const target = normalize(deg);
      if (!initialized) {
        smoothed = target;
        initialized = true;
        pushResidual(0);
        return smoothed;
      }

      const delta = shortestDelta(target, smoothed);
      smoothed = normalize(smoothed + alpha * delta);
      const residual = shortestDelta(target, smoothed);
      pushResidual(residual);
      return smoothed;
    },
    rms: () => {
      if (residuals.length === 0) {
        return 0;
      }
      const meanSquare =
        residuals.reduce((acc, value) => acc + value * value, 0) / residuals.length;
      return Math.sqrt(meanSquare);
    },
    reset: () => {
      smoothed = 0;
      initialized = false;
      residuals.length = 0;
    },
  };
}

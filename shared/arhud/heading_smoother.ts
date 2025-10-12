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
const DEFAULT_WINDOW = 20;

function normalizeDegrees(value: number): number {
  const mod = value % 360;
  return mod < 0 ? mod + 360 : mod;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

function shortestDelta(source: number, target: number): number {
  let delta = source - target;
  delta = ((delta + 540) % 360) - 180;
  return delta;
}

export function createHeadingSmoother(
  opts: HeadingSmootherOptions = {},
): HeadingSmoother {
  const alpha = Math.min(Math.max(opts.alpha ?? DEFAULT_ALPHA, 0.01), 1);
  const windowSize = Math.max(1, Math.floor(opts.window ?? DEFAULT_WINDOW));

  let emaX: number | null = null;
  let emaY: number | null = null;
  const vectorWindow: Array<{ x: number; y: number }> = [];
  const errorWindow: number[] = [];
  let sumSq = 0;

  const reset = () => {
    emaX = null;
    emaY = null;
    vectorWindow.length = 0;
    errorWindow.length = 0;
    sumSq = 0;
  };

  const next = (deg: number) => {
    const rad = toRadians(normalizeDegrees(deg));
    const vector = { x: Math.cos(rad), y: Math.sin(rad) };

    vectorWindow.push(vector);
    if (vectorWindow.length > windowSize) {
      vectorWindow.shift();
    }

    if (emaX === null || emaY === null) {
      emaX = vector.x;
      emaY = vector.y;
    } else {
      emaX = alpha * vector.x + (1 - alpha) * emaX;
      emaY = alpha * vector.y + (1 - alpha) * emaY;
    }

    let magnitude = Math.hypot(emaX, emaY);
    if (magnitude < 1e-6 && vectorWindow.length) {
      let avgX = 0;
      let avgY = 0;
      for (const entry of vectorWindow) {
        avgX += entry.x;
        avgY += entry.y;
      }
      emaX = avgX / vectorWindow.length;
      emaY = avgY / vectorWindow.length;
      magnitude = Math.hypot(emaX, emaY);
    }

    if (magnitude < 1e-6) {
      emaX = vector.x;
      emaY = vector.y;
      magnitude = 1;
    }

    emaX /= magnitude;
    emaY /= magnitude;

    const smoothed = normalizeDegrees(toDegrees(Math.atan2(emaY, emaX)));
    const error = shortestDelta(deg, smoothed);
    const squared = error * error;
    errorWindow.push(squared);
    sumSq += squared;
    if (errorWindow.length > windowSize) {
      const removed = errorWindow.shift() ?? 0;
      sumSq -= removed;
    }

    return smoothed;
  };

  const rms = () => {
    if (errorWindow.length === 0) {
      return 0;
    }
    return Math.sqrt(sumSq / errorWindow.length);
  };

  return {
    next,
    rms,
    reset,
  };
}

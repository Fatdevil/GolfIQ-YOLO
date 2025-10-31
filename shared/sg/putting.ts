import { loadDefaultPuttingBaseline, type SGBaseline } from './baseline';

export type PuttEvent = {
  start_m: number;
  end_m: number;
  holed: boolean;
};

export type HolePuttingSG = {
  total: number;
  perPutt: number[];
  baseline: { start: number[]; end: number[] };
};

export class InvalidPuttSequenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPuttSequenceError';
  }
}

const DISTANCE_TOLERANCE = 1e-4;

const createEmptyResult = (): HolePuttingSG => ({
  total: 0,
  perPutt: [],
  baseline: { start: [], end: [] },
});

const sanitizeDistance = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new InvalidPuttSequenceError('Distance must be finite.');
  }
  if (numeric < 0) {
    if (numeric >= -DISTANCE_TOLERANCE) {
      return 0;
    }
    throw new InvalidPuttSequenceError('Distance must be non-negative.');
  }
  return numeric;
};

const resolveBaseline = (baseline?: SGBaseline): SGBaseline =>
  typeof baseline === 'function' ? baseline : loadDefaultPuttingBaseline();

export function holePuttingSG(events: PuttEvent[], E: SGBaseline = loadDefaultPuttingBaseline()): HolePuttingSG {
  if (!Array.isArray(events) || events.length === 0) {
    return createEmptyResult();
  }
  const baseline = resolveBaseline(E);
  const perPutt: number[] = [];
  const baselineStart: number[] = [];
  const baselineEnd: number[] = [];

  let total = 0;

  for (let idx = 0; idx < events.length; idx += 1) {
    const event = events[idx];
    if (!event || typeof event !== 'object') {
      throw new InvalidPuttSequenceError('Putt events must be objects.');
    }
    const startRaw = sanitizeDistance(event.start_m);
    const endRaw = sanitizeDistance(event.end_m);
    if (startRaw + DISTANCE_TOLERANCE < endRaw) {
      throw new InvalidPuttSequenceError('Putt distances must be non-increasing.');
    }

    const isLast = idx === events.length - 1;
    const end = endRaw <= DISTANCE_TOLERANCE ? 0 : endRaw;

    if (isLast) {
      if (!event.holed) {
        throw new InvalidPuttSequenceError('Final putt must be marked as holed.');
      }
      if (end > DISTANCE_TOLERANCE) {
        throw new InvalidPuttSequenceError('Holed putt must finish at the cup.');
      }
    } else if (event.holed) {
      throw new InvalidPuttSequenceError('Only the final putt can be holed.');
    }

    const startExp = baseline(startRaw);
    const endDistance = isLast ? 0 : end;
    const endExp = baseline(endDistance);
    const sg = startExp - 1 - endExp;

    perPutt.push(sg);
    baselineStart.push(startExp);
    baselineEnd.push(endExp);
    total += sg;
  }

  return { total, perPutt, baseline: { start: baselineStart, end: baselineEnd } };
}

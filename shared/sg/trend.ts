import type { TrainingFocus } from '../training/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type FocusSgSample = {
  focus: TrainingFocus;
  sg: number;
  recordedAt: number | Date;
};

export type FocusTrend = {
  d7: number;
  d30: number;
};

type TimestampedValue = {
  ts: number;
  value: number;
};

const toTimestamp = (input: number | Date): number | null => {
  if (input instanceof Date) {
    const value = input.getTime();
    return Number.isFinite(value) ? value : null;
  }
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input;
  }
  return null;
};

const normaliseSamples = (samples: FocusSgSample[]): Map<TrainingFocus, TimestampedValue[]> => {
  const result = new Map<TrainingFocus, TimestampedValue[]>();
  samples.forEach((sample) => {
    if (typeof sample.sg !== 'number' || !Number.isFinite(sample.sg)) {
      return;
    }
    const ts = toTimestamp(sample.recordedAt);
    if (ts === null) {
      return;
    }
    const bucket = result.get(sample.focus);
    const entry: TimestampedValue = { ts, value: sample.sg };
    if (bucket) {
      bucket.push(entry);
    } else {
      result.set(sample.focus, [entry]);
    }
  });
  result.forEach((values) => values.sort((a, b) => a.ts - b.ts));
  return result;
};

const averageBetween = (values: TimestampedValue[], start: number, end: number): number | null => {
  const windowValues = values
    .filter((entry) => entry.ts > start && entry.ts <= end)
    .map((entry) => entry.value);
  if (!windowValues.length) {
    return null;
  }
  const total = windowValues.reduce((sum, value) => sum + value, 0);
  return total / windowValues.length;
};

const computeWindowDelta = (
  values: TimestampedValue[],
  now: number,
  windowDays: number,
): number | null => {
  const windowMs = windowDays * MS_PER_DAY;
  const currentStart = now - windowMs;
  const prevStart = currentStart - windowMs;
  const currentAvg = averageBetween(values, currentStart, now);
  if (currentAvg === null) {
    return null;
  }
  const previousAvg = averageBetween(values, prevStart, currentStart);
  const baseline = previousAvg ?? 0;
  return currentAvg - baseline;
};

export const computeFocusTrend = (
  samples: FocusSgSample[],
  now: Date | number = Date.now(),
): Partial<Record<TrainingFocus, FocusTrend>> => {
  const timestamp = typeof now === 'number' ? now : now.getTime();
  if (!Number.isFinite(timestamp)) {
    return {};
  }
  const grouped = normaliseSamples(samples);
  const trend: Partial<Record<TrainingFocus, FocusTrend>> = {};
  grouped.forEach((values, focus) => {
    const d7 = computeWindowDelta(values, timestamp, 7);
    const d30 = computeWindowDelta(values, timestamp, 30);
    if (d7 === null && d30 === null) {
      return;
    }
    trend[focus] = {
      d7: d7 ?? 0,
      d30: d30 ?? 0,
    };
  });
  return trend;
};

export const __private__ = {
  normaliseSamples,
  toTimestamp,
  averageBetween,
  computeWindowDelta,
};

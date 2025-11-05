import type {
  AcceptSample,
  LearningOptions,
  MetricEma,
  OutcomeSample,
  ProfileKey,
  Suggestion,
} from "./types";

const DEFAULT_ALPHA = 0.2;
const DEFAULT_TARGET = 0.7;
const DEFAULT_GAIN = 0.5;
const DEFAULT_MIN_SAMPLES = 50;
const HALF_SAMPLE_THRESHOLD = 100;
const MAX_DELTA = 0.2;
const MAX_APPLY_DELTA = 0.1;

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const clampDelta = (value: number): number => clamp(value, -MAX_DELTA, MAX_DELTA);

const clampApplyDelta = (value: number): number => clamp(value, -MAX_APPLY_DELTA, MAX_APPLY_DELTA);

type Key = `${ProfileKey}::${string}`;

type EmaState = {
  ema: number;
  total: number;
  samples: number;
};

type CombinedState = {
  accept: EmaState | null;
  success: EmaState | null;
};

const toKey = (profile: ProfileKey, clubId: string): Key => `${profile}::${clubId}`;

const sanitizeClub = (value: string): string => value?.trim() ?? "";

const sanitizePositive = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

const sanitizeNonNegative = (value: number): number => (Number.isFinite(value) && value >= 0 ? value : 0);

const updateEma = (state: EmaState | null, value: number, weight: number, alpha: number): EmaState => {
  const clampedWeight = sanitizePositive(weight);
  const clampedValue = clamp01(value);
  if (!state) {
    return {
      ema: clampedValue,
      total: clampedValue * clampedWeight,
      samples: clampedWeight,
    };
  }
  const ema = alpha * clampedValue + (1 - alpha) * state.ema;
  return {
    ema,
    total: state.total + clampedValue * clampedWeight,
    samples: state.samples + clampedWeight,
  };
};

export type FoldOptions = LearningOptions;

type FoldResult = Record<Key, CombinedState>;

const mergeAccept = (
  acc: FoldResult,
  sample: AcceptSample,
  alpha: number,
): FoldResult => {
  const profile = sample.profile;
  const clubId = sanitizeClub(sample.clubId);
  if (!clubId) {
    return acc;
  }
  const presented = sanitizePositive(sample.presented);
  if (!presented) {
    return acc;
  }
  const accepted = sanitizeNonNegative(sample.accepted);
  const ratio = clamp01(presented ? accepted / presented : 0);
  const key = toKey(profile, clubId);
  const prev = acc[key] ?? { accept: null, success: null };
  const acceptState = updateEma(prev.accept, ratio, presented, alpha);
  acc[key] = { accept: acceptState, success: prev.success };
  return acc;
};

const mergeOutcome = (
  acc: FoldResult,
  sample: OutcomeSample,
  alpha: number,
): FoldResult => {
  const profile = sample.profile;
  const clubId = sanitizeClub(sample.clubId);
  if (!clubId) {
    return acc;
  }
  const tp = sanitizeNonNegative(sample.tp);
  const fn = sanitizeNonNegative(sample.fn);
  const attempts = sanitizePositive(tp + fn);
  if (!attempts) {
    return acc;
  }
  const precision = clamp01(tp / attempts);
  const key = toKey(profile, clubId);
  const prev = acc[key] ?? { accept: null, success: null };
  const successState = updateEma(prev.success, precision, attempts, alpha);
  acc[key] = { accept: prev.accept, success: successState };
  return acc;
};

const toSuggestion = (
  profile: ProfileKey,
  clubId: string,
  combined: CombinedState,
  target: number,
  gain: number,
  minSamples: number,
): Suggestion | null => {
  const acceptState = combined.accept;
  const successState = combined.success;
  if (!successState || successState.samples < minSamples) {
    return null;
  }
  const sampleSize = Math.floor(
    acceptState ? Math.min(successState.samples, acceptState.samples) : successState.samples,
  );
  if (sampleSize < minSamples) {
    return null;
  }
  const precision = clamp01(successState.ema);
  const gap = target - precision;
  let delta = clampDelta(gap * gain);
  if (sampleSize < HALF_SAMPLE_THRESHOLD) {
    delta = delta / 2;
  }
  delta = clampApplyDelta(delta);
  const magnitude = Math.min(MAX_APPLY_DELTA, Math.abs(delta));
  const hazardDelta = (delta >= 0 ? 1 : -1) * magnitude * 0.5;
  const distanceDelta = (delta >= 0 ? -1 : 1) * magnitude * 0.5;

  return {
    clubId,
    profile,
    acceptEma: clamp01(acceptState ? acceptState.ema : 0),
    successEma: precision,
    sampleSize,
    target,
    delta,
    hazardDelta,
    distanceDelta,
    updatedAt: Date.now(),
  } satisfies Suggestion;
};

export function fold(
  accepts: ReadonlyArray<AcceptSample>,
  outcomes: ReadonlyArray<OutcomeSample>,
  options?: FoldOptions,
): Suggestion[] {
  const alpha = options?.alpha ?? DEFAULT_ALPHA;
  const target = options?.targetPrecision ?? DEFAULT_TARGET;
  const gain = options?.gain ?? DEFAULT_GAIN;
  const minSamples = options?.minSamples ?? DEFAULT_MIN_SAMPLES;

  const combined: FoldResult = {};
  const sortedAccepts = [...accepts].sort((a, b) => a.ts - b.ts);
  const sortedOutcomes = [...outcomes].sort((a, b) => a.ts - b.ts);

  for (const sample of sortedAccepts) {
    mergeAccept(combined, sample, alpha);
  }
  for (const sample of sortedOutcomes) {
    mergeOutcome(combined, sample, alpha);
  }

  const suggestions: Suggestion[] = [];
  for (const [key, state] of Object.entries(combined)) {
    const [profile, clubId] = key.split("::") as [ProfileKey, string];
    const suggestion = toSuggestion(profile, clubId, state, target, gain, minSamples);
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }
  suggestions.sort((a, b) => b.sampleSize - a.sampleSize || a.clubId.localeCompare(b.clubId));
  return suggestions;
}

export function foldToMap(
  accepts: ReadonlyArray<AcceptSample>,
  outcomes: ReadonlyArray<OutcomeSample>,
  options?: FoldOptions,
): Record<ProfileKey, Record<string, Suggestion>> {
  const suggestions = fold(accepts, outcomes, options);
  const map: Record<ProfileKey, Record<string, Suggestion>> = {
    conservative: {},
    neutral: {},
    aggressive: {},
  };
  for (const suggestion of suggestions) {
    if (!map[suggestion.profile]) {
      map[suggestion.profile] = {} as Record<string, Suggestion>;
    }
    map[suggestion.profile][suggestion.clubId] = suggestion;
  }
  return map;
}

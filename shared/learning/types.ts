import type { RiskProfile } from "../caddie/strategy_profiles";

export type ProfileKey = RiskProfile;

export type AcceptSample = {
  ts: number;
  profile: ProfileKey;
  clubId: string;
  presented: number;
  accepted: number;
};

export type OutcomeSample = {
  ts: number;
  profile: ProfileKey;
  clubId: string;
  tp: number;
  fn: number;
};

export type MetricEma = {
  value: number;
  sample: number;
};

export type Suggestion = {
  clubId: string;
  profile: ProfileKey;
  acceptEma: number;
  successEma: number;
  sampleSize: number;
  target: number;
  delta: number;
  hazardDelta: number;
  distanceDelta: number;
  updatedAt: number;
};

export type LearningSnapshot = {
  accept: MetricEma;
  success: MetricEma;
};

export type SuggestionMap = Partial<Record<ProfileKey, Record<string, Suggestion>>>;

export type LearningState = {
  version: number;
  suggestions: SuggestionMap;
};

export type SuggestionInput = {
  accept: MetricEma;
  success: MetricEma;
  target: number;
  sampleSize: number;
  delta: number;
  hazardDelta: number;
  distanceDelta: number;
  updatedAt: number;
};

export type LearningOptions = {
  alpha?: number;
  targetPrecision?: number;
  gain?: number;
  minSamples?: number;
};

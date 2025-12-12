import type { PracticeRecommendationsExperimentVariant } from '../experiments/flags';
import type { TelemetryClient } from './practiceGoalAnalytics';

export type PracticeMissionRecommendationReason = 'focus_area' | 'goal_progress' | 'fallback';

export type PracticeMissionRecommendationSurface =
  | 'mobile_practice_missions'
  | 'web_practice_missions'
  | 'mobile_home_practice'
  | 'web_home_practice';

export type PracticeMissionRecommendationExperiment = {
  experimentKey: 'practice_recommendations';
  experimentBucket: number;
  experimentVariant: PracticeRecommendationsExperimentVariant;
};

export type PracticeRecommendationContext = {
  source: 'practice_recommendations';
  rank?: number | null;
  focusArea?: string | null;
  reasonKey?: PracticeMissionRecommendationReason | string | null;
  experiment?: PracticeMissionRecommendationExperiment;
  algorithmVersion?: string | null;
  surface?: PracticeMissionRecommendationSurface | string | null;
};

type PracticeMissionRecommendationBase = {
  missionId: string;
  reason: PracticeMissionRecommendationReason;
  rank: number;
  surface: PracticeMissionRecommendationSurface;
  focusArea?: string | null;
  focusAreas?: string[] | null;
  weeklyGoalId?: string | null;
  weekId?: string | null;
  experiment?: PracticeMissionRecommendationExperiment;
  algorithmVersion?: string;
};

export type PracticeMissionRecommendationShownEvent = PracticeMissionRecommendationBase;

export type PracticeMissionRecommendationClickedEvent = PracticeMissionRecommendationBase & {
  entryPoint: string;
};

function sanitizeString(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizeNullableString(value?: string | null): string | null | undefined {
  if (value == null) return undefined;
  return sanitizeString(value) ?? null;
}

function sanitizeStringArray(values?: string[] | null): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const cleaned = values.map((value) => sanitizeString(value)).filter(Boolean) as string[];
  return cleaned.length > 0 ? cleaned : undefined;
}

function sanitizeExperiment(
  experiment?: PracticeMissionRecommendationExperiment,
): PracticeMissionRecommendationExperiment | undefined {
  if (!experiment) return undefined;
  const bucket = Number.isFinite(experiment.experimentBucket)
    ? Math.max(0, Math.floor(experiment.experimentBucket))
    : 0;
  const variant: PracticeRecommendationsExperimentVariant =
    experiment.experimentVariant === 'treatment'
      ? 'treatment'
      : experiment.experimentVariant === 'disabled'
        ? 'disabled'
        : 'control';
  return {
    experimentKey: 'practice_recommendations',
    experimentBucket: bucket,
    experimentVariant: variant,
  };
}

function sanitizeSurface(value?: PracticeMissionRecommendationSurface | string | null):
  | PracticeMissionRecommendationSurface
  | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  if (normalized === 'mobile_home_practice') return 'mobile_home_practice';
  if (normalized === 'web_home_practice') return 'web_home_practice';
  if (normalized === 'mobile_practice_missions') return 'mobile_practice_missions';
  if (normalized === 'web_practice_missions') return 'web_practice_missions';
  return undefined;
}

export function sanitizePracticeRecommendationContext(
  context?: PracticeRecommendationContext,
): PracticeRecommendationContext | undefined {
  if (!context) return undefined;

  return {
    source: 'practice_recommendations',
    rank:
      typeof context.rank === 'number' && Number.isFinite(context.rank)
        ? Math.max(1, Math.round(context.rank))
        : undefined,
    focusArea: sanitizeNullableString(context.focusArea),
    reasonKey: sanitizeNullableString(context.reasonKey),
    experiment: sanitizeExperiment(context.experiment),
    algorithmVersion: sanitizeNullableString(context.algorithmVersion),
    surface: sanitizeSurface(context.surface),
  };
}

export function buildPracticeMissionRecommendationShownEvent(
  input: PracticeMissionRecommendationBase,
): PracticeMissionRecommendationShownEvent {
  return {
    missionId: input.missionId,
    reason: input.reason,
    rank: Math.max(1, Math.round(input.rank)),
    surface: input.surface,
    focusArea: sanitizeNullableString(input.focusArea),
    focusAreas: sanitizeStringArray(input.focusAreas),
    weeklyGoalId: sanitizeNullableString(input.weeklyGoalId),
    weekId: sanitizeNullableString(input.weekId),
    experiment: sanitizeExperiment(input.experiment),
    algorithmVersion: sanitizeString(input.algorithmVersion),
  };
}

export function buildPracticeMissionRecommendationClickedEvent(
  input: PracticeMissionRecommendationClickedEvent,
): PracticeMissionRecommendationClickedEvent {
  return {
    ...buildPracticeMissionRecommendationShownEvent(input),
    entryPoint: input.entryPoint,
  };
}

export function emitPracticeMissionRecommendationShown(
  client: TelemetryClient,
  input: PracticeMissionRecommendationBase,
): void {
  client.emit(
    'practice_mission_recommendation_shown',
    buildPracticeMissionRecommendationShownEvent(input),
  );
}

export function emitPracticeMissionRecommendationClicked(
  client: TelemetryClient,
  input: PracticeMissionRecommendationClickedEvent,
): void {
  client.emit(
    'practice_mission_recommendation_clicked',
    buildPracticeMissionRecommendationClickedEvent(input),
  );
}

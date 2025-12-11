import type { TelemetryClient } from './practiceGoalAnalytics';
import type { PracticeRecommendationContext } from './practiceRecommendationsAnalytics';
import { sanitizePracticeRecommendationContext } from './practiceRecommendationsAnalytics';

function sanitizeIdentifier(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizeCount(value?: number | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < 0) return undefined;
  return Math.round(value);
}

export type PracticeMissionStartEvent = {
  missionId?: string | null;
  sourceSurface: string;
  recommendation?: PracticeRecommendationContext;
};

export type PracticeMissionCompleteEvent = {
  missionId?: string | null;
  samplesCount?: number | null;
  recommendation?: PracticeRecommendationContext;
};

export function buildPracticeMissionStartEvent(
  input: PracticeMissionStartEvent,
): PracticeMissionStartEvent {
  const recommendation = sanitizePracticeRecommendationContext(input.recommendation);
  const event: PracticeMissionStartEvent = {
    missionId: sanitizeIdentifier(input.missionId),
    sourceSurface: input.sourceSurface,
  };

  if (recommendation) {
    event.recommendation = recommendation;
  }

  return event;
}

export function buildPracticeMissionCompleteEvent(
  input: PracticeMissionCompleteEvent,
): PracticeMissionCompleteEvent {
  const recommendation = sanitizePracticeRecommendationContext(input.recommendation);
  const event: PracticeMissionCompleteEvent = {
    missionId: sanitizeIdentifier(input.missionId),
    samplesCount: sanitizeCount(input.samplesCount),
  };

  if (recommendation) {
    event.recommendation = recommendation;
  }

  return event;
}

export function emitPracticeMissionStart(
  client: TelemetryClient,
  input: PracticeMissionStartEvent,
): void {
  client.emit('practice_mission_start', buildPracticeMissionStartEvent(input));
}

export function emitPracticeMissionComplete(
  client: TelemetryClient,
  input: PracticeMissionCompleteEvent,
): void {
  client.emit('practice_mission_complete', buildPracticeMissionCompleteEvent(input));
}

import type { TelemetryClient } from './practiceGoalAnalytics';
import type { PracticeReadinessSummary } from './practiceReadiness';

export type PracticeReadinessSurface = 'round_story' | 'bag_recap' | 'bag_view';

export interface PracticeReadinessViewedInput {
  surface: PracticeReadinessSurface;
  platform: 'mobile' | 'web';
  roundId?: string | null;
  summary: PracticeReadinessSummary;
}

export type PracticeReadinessViewedEvent = {
  surface: PracticeReadinessSurface;
  platform: 'mobile' | 'web';
  roundId?: string;
  sessionsCompleted: number;
  shotsCompleted: number;
  goalTarget: number | null;
  goalProgress: number;
  goalReached: boolean;
};

function sanitizeIdentifier(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildPracticeReadinessViewedEvent(
  input: PracticeReadinessViewedInput,
): PracticeReadinessViewedEvent {
  const { summary } = input;
  return {
    surface: input.surface,
    platform: input.platform,
    roundId: sanitizeIdentifier(input.roundId),
    sessionsCompleted: Math.max(0, Math.round(summary.sessionsCompleted)),
    shotsCompleted: Math.max(0, Math.round(summary.shotsCompleted)),
    goalTarget: summary.goalTarget != null ? Math.max(0, Math.round(summary.goalTarget)) : null,
    goalProgress: Math.max(0, Math.round(summary.goalProgress)),
    goalReached: Boolean(summary.goalReached),
  };
}

export function emitPracticeReadinessViewed(
  client: TelemetryClient,
  input: PracticeReadinessViewedInput,
): void {
  client.emit('practice_readiness_viewed', buildPracticeReadinessViewedEvent(input));
}

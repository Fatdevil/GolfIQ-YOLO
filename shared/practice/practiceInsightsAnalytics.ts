import type { TelemetryClient } from './practiceGoalAnalytics';

export type WeeklyPracticeInsightsSurface = 'practice_missions_mobile' | 'practice_missions_web';

export type WeeklyPracticeInsightsViewedEvent = {
  thisWeekMissions: number;
  lastWeekMissions: number;
  thisWeekGoalReached: boolean;
  lastWeekGoalReached: boolean;
  thisWeekPlanCompleted: boolean;
  lastWeekPlanCompleted: boolean;
  surface: WeeklyPracticeInsightsSurface;
  targetMissionsPerWeek?: number;
};

export function emitWeeklyPracticeInsightsViewed(
  client: TelemetryClient,
  payload: WeeklyPracticeInsightsViewedEvent,
): void {
  client.emit('weekly_practice_insights_viewed', payload);
}

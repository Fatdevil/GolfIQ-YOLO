import type { TelemetryClient } from './practiceGoalAnalytics';

export type WeeklyPracticeHistorySurface = 'mobile_practice_missions' | 'web_practice_missions';

export type WeeklyPracticeHistoryViewedEvent = {
  surface: WeeklyPracticeHistorySurface;
  weeks: number;
};

export function emitWeeklyPracticeHistoryViewed(
  client: TelemetryClient,
  payload: WeeklyPracticeHistoryViewedEvent,
): void {
  client.emit('practice_weekly_history_viewed', payload);
}

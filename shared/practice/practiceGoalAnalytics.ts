export type TelemetryClient = {
  emit: (event: string, payload: Record<string, unknown>) => void;
};

export type PracticeGoalReachedEvent = {
  goalId: 'weekly_mission_completions';
  targetCompletions: number;
  completedInWindow: number;
  windowDays: number;
  platform: 'mobile' | 'web';
  source: 'practice_mission' | 'quick_practice' | 'round_recap';
  streak_weeks?: number;
};

export function trackPracticeGoalReached(
  client: TelemetryClient,
  payload: PracticeGoalReachedEvent,
): void {
  client.emit('practice_goal_reached', payload);
}

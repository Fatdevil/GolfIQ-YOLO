import {
  DEFAULT_TARGET_MISSIONS_PER_WEEK,
  isDefaultWeeklyPracticeGoalTarget,
  normalizeWeeklyPracticeGoalSettings,
} from './practiceGoalSettings';
import type { PracticeGoalProgress } from './practiceGoals';

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

export type WeeklyPracticeGoalSettingsSource = 'mobile_settings_screen' | 'web_home_inline';

export type WeeklyPracticeGoalSettingsUpdatedInput = {
  previousTarget?: number | null;
  newTarget: number;
  source: WeeklyPracticeGoalSettingsSource;
};

export type WeeklyPracticeGoalSettingsUpdatedEvent = WeeklyPracticeGoalSettingsUpdatedInput & {
  isDefaultBefore: boolean;
  isDefaultAfter: boolean;
};

function sanitizeTarget(target: number | null | undefined): number | null {
  if (typeof target !== 'number') return null;
  if (!Number.isFinite(target) || target <= 0) return null;
  return normalizeWeeklyPracticeGoalSettings({ targetMissionsPerWeek: target }).targetMissionsPerWeek;
}

export function buildWeeklyPracticeGoalSettingsUpdatedEvent(
  input: WeeklyPracticeGoalSettingsUpdatedInput,
): WeeklyPracticeGoalSettingsUpdatedEvent {
  const sanitizedPreviousTarget = sanitizeTarget(input.previousTarget);
  const sanitizedNewTarget =
    sanitizeTarget(input.newTarget) ?? DEFAULT_TARGET_MISSIONS_PER_WEEK;

  return {
    previousTarget: sanitizedPreviousTarget,
    newTarget: sanitizedNewTarget,
    source: input.source,
    isDefaultBefore: isDefaultWeeklyPracticeGoalTarget(sanitizedPreviousTarget),
    isDefaultAfter: isDefaultWeeklyPracticeGoalTarget(sanitizedNewTarget),
  };
}

export function trackWeeklyPracticeGoalSettingsUpdated(
  client: TelemetryClient,
  input: WeeklyPracticeGoalSettingsUpdatedInput,
): void {
  client.emit(
    'practice_goal_settings_updated',
    buildWeeklyPracticeGoalSettingsUpdatedEvent(input),
  );
}

export type PracticeGoalNudgeContext = {
  progress: PracticeGoalProgress;
  surface: 'mobile_home' | 'web_home';
  experimentKey: 'weekly_goal_nudge';
  experimentBucket: number;
  experimentVariant: 'control' | 'treatment';
  cta?: 'practice_missions' | 'practice_progress';
};

export function buildPracticeGoalNudgeEventPayload(
  context: PracticeGoalNudgeContext,
): Record<string, unknown> {
  const completionPercent = context.progress.targetCompletions
    ? Math.min(context.progress.completedInWindow / context.progress.targetCompletions, 1)
    : 0;

  return {
    goalId: context.progress.goalId,
    targetCompletions: context.progress.targetCompletions,
    completedInWindow: context.progress.completedInWindow,
    remainingToTarget: context.progress.remainingToTarget,
    completionPercent,
    surface: context.surface,
    experimentKey: context.experimentKey,
    experimentBucket: context.experimentBucket,
    experimentVariant: context.experimentVariant,
    cta: context.cta,
  };
}

export function trackPracticeGoalNudgeShown(
  client: TelemetryClient,
  context: PracticeGoalNudgeContext,
): void {
  client.emit('practice_goal_nudge_shown', buildPracticeGoalNudgeEventPayload(context));
}

export function trackPracticeGoalNudgeClicked(
  client: TelemetryClient,
  context: PracticeGoalNudgeContext,
): void {
  client.emit('practice_goal_nudge_clicked', buildPracticeGoalNudgeEventPayload(context));
}

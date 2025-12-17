import { safeEmit } from '@app/telemetry';

export function logPracticeWeeklySummaryViewed(payload: {
  sessionsCount: number;
  drillsCompleted: number;
  streakDays: number;
  hasPlan: boolean;
  planCompletionPct?: number;
  source?: 'home' | 'journal';
}): void {
  try {
    safeEmit('practice_weekly_summary_viewed', { surface: 'mobile', ...payload });
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[mobile/analytics] failed to log practice weekly summary view', error);
    }
  }
}

export function logPracticeWeeklySummaryShare(payload: {
  sessionsCount: number;
  drillsCompleted: number;
  streakDays: number;
  hasPlan: boolean;
  planCompletionPct?: number;
  source?: 'home' | 'journal';
}): void {
  try {
    safeEmit('practice_weekly_summary_share_tapped', { surface: 'mobile', ...payload });
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[mobile/analytics] failed to log practice weekly summary share', error);
    }
  }
}

export function logPracticeWeeklySummaryStartPractice(payload: {
  sessionsCount: number;
  drillsCompleted: number;
  streakDays: number;
  hasPlan: boolean;
  planCompletionPct?: number;
  source?: 'home' | 'journal';
}): void {
  try {
    safeEmit('practice_weekly_summary_start_practice_tapped', { surface: 'mobile', ...payload });
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[mobile/analytics] failed to log practice weekly summary start practice', error);
    }
  }
}

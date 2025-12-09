import { safeEmit } from '@app/telemetry';

import type { QuickPracticeEntrySource } from '@app/navigation/types';

export type QuickPracticeSessionStartEvent = {
  surface: 'mobile';
  entrySource?: QuickPracticeEntrySource;
  hasRecommendation?: boolean;
  targetClubsCount?: number;
};

export type QuickPracticeSessionCompleteEvent = {
  surface: 'mobile';
  entrySource?: QuickPracticeEntrySource;
  hasRecommendation?: boolean;
  swingsCount?: number;
  durationSeconds?: number;
};

export function logQuickPracticeSessionStart(payload: QuickPracticeSessionStartEvent): void {
  try {
    safeEmit('practice_quick_session_start', payload);
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[mobile/analytics] failed to log quick practice start', error);
    }
  }
}

export function logQuickPracticeSessionComplete(payload: QuickPracticeSessionCompleteEvent): void {
  try {
    safeEmit('practice_quick_session_complete', payload);
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[mobile/analytics] failed to log quick practice completion', error);
    }
  }
}

import { safeEmit } from '@app/telemetry';

export function logPracticeJournalOpened(): void {
  try {
    safeEmit('practice_journal_opened', { surface: 'mobile' });
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[mobile/analytics] failed to log practice journal opened', error);
    }
  }
}

export function logPracticeSessionShared(payload: {
  sessionId?: string;
  minutes?: number;
  drills?: number;
}): void {
  try {
    safeEmit('practice_session_shared', { surface: 'mobile', ...payload });
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[mobile/analytics] failed to log practice session share', error);
    }
  }
}

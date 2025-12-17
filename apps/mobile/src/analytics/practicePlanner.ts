import { safeEmit } from '@app/telemetry';

export type PracticeStartClickPayload = {
  source: 'coach_report' | 'other';
  drillCount?: number;
  maxMinutes?: number;
};

export function logPracticeStartClick(payload: PracticeStartClickPayload): void {
  try {
    safeEmit('practice_start_click', { surface: 'mobile', ...payload });
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[mobile/analytics] failed to log practice start click', error);
    }
  }
}

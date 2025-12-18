import { safeEmit } from '@app/telemetry';

export type PracticeFeatureGateSource = 'deeplink' | 'home' | 'coach_report' | 'unknown';

export function logPracticeFeatureGated(payload: {
  feature: 'practiceGrowthV1';
  target: string;
  source: PracticeFeatureGateSource;
}): void {
  try {
    safeEmit('practice_feature_gated', payload);
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[mobile/analytics] failed to log practice feature gated', error);
    }
  }
}

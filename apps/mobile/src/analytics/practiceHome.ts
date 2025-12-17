import { safeEmit } from '@app/telemetry';

export type PracticeHomeCtaType = 'start' | 'view_plan' | 'build_plan';

export type PracticeHomeCardViewedEvent = {
  surface: 'mobile';
  hasPlan: boolean;
  totalDrills?: number;
  completedDrills?: number;
};

export function logPracticeHomeCardViewed(payload: {
  hasPlan: boolean;
  totalDrills?: number;
  completedDrills?: number;
}): void {
  try {
    const event: PracticeHomeCardViewedEvent = { surface: 'mobile', ...payload };
    safeEmit('practice_home_card_viewed', event);
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[mobile/analytics] failed to log practice home card viewed', error);
    }
  }
}

export function logPracticeHomeCta(type: PracticeHomeCtaType): void {
  try {
    safeEmit('practice_home_cta', { surface: 'mobile', type });
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[mobile/analytics] failed to log practice home CTA', error);
    }
  }
}

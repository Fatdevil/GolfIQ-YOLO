import { t } from '@app/i18n';
import { MIN_AUTOCALIBRATED_SAMPLES, type DistanceSource } from '@shared/caddie/bagStats';

export function formatDistanceSourceLabel(
  distanceSource?: DistanceSource | null,
  sampleCount?: number | null,
  minSamples?: number | null,
): string | null {
  if (!distanceSource) return null;

  switch (distanceSource) {
    case 'auto_calibrated':
      return t('caddie.calibration.auto', { count: sampleCount ?? 0 });
    case 'partial_stats':
      return t('caddie.calibration.partial', {
        count: sampleCount ?? 0,
        min: minSamples ?? MIN_AUTOCALIBRATED_SAMPLES,
      });
    case 'manual':
      return t('caddie.calibration.manual');
    case 'default':
    default:
      return t('caddie.calibration.default');
  }
}

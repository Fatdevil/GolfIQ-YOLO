import { t } from '@app/i18n';
import type { BagSuggestion } from '@shared/caddie/bagTuningSuggestions';
import { formatDistance } from '@app/utils/distance';

export function formatBagSuggestion(
  suggestion: BagSuggestion,
  clubLabels: Record<string, string>,
): string | null {
  const lower = suggestion.lowerClubId ? clubLabels[suggestion.lowerClubId] ?? suggestion.lowerClubId : null;
  const upper = suggestion.upperClubId ? clubLabels[suggestion.upperClubId] ?? suggestion.upperClubId : null;
  const clubLabel = suggestion.clubId ? clubLabels[suggestion.clubId] ?? suggestion.clubId : null;
  const distanceLabel =
    suggestion.gapDistance != null ? formatDistance(suggestion.gapDistance, { withUnit: true }) : null;

  if (suggestion.type === 'fill_gap' && lower && upper && distanceLabel) {
    return t('bag.suggestions.fill_gap', { lower, upper, distance: distanceLabel });
  }

  if (suggestion.type === 'reduce_overlap' && lower && upper) {
    return t('bag.suggestions.reduce_overlap', { lower, upper, distance: distanceLabel });
  }

  if (suggestion.type === 'calibrate' && clubLabel) {
    return t(
      suggestion.severity === 'high'
        ? 'bag.suggestions.calibrate.no_data'
        : 'bag.suggestions.calibrate.needs_more_samples',
      { club: clubLabel },
    );
  }

  return null;
}

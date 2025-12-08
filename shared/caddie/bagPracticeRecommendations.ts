import type { BagReadinessOverview } from './bagReadiness';
import type { BagSuggestion } from './bagTuningSuggestions';

export interface BagPracticeRecommendation {
  id: string;
  titleKey: string;
  descriptionKey: string;
  targetClubs: string[];
  targetSampleCount?: number;
  sourceSuggestionId: string;
}

function mapFillGapSuggestion(suggestion: BagSuggestion): BagPracticeRecommendation | null {
  if (!suggestion.lowerClubId || !suggestion.upperClubId) return null;

  return {
    id: `practice_fill_gap:${suggestion.lowerClubId}:${suggestion.upperClubId}`,
    titleKey: 'bag.practice.fill_gap.title',
    descriptionKey: 'bag.practice.fill_gap.description',
    targetClubs: [suggestion.lowerClubId, suggestion.upperClubId],
    targetSampleCount: 16,
    sourceSuggestionId: suggestion.id,
  };
}

function mapOverlapSuggestion(suggestion: BagSuggestion): BagPracticeRecommendation | null {
  if (!suggestion.lowerClubId || !suggestion.upperClubId) return null;

  return {
    id: `practice_reduce_overlap:${suggestion.lowerClubId}:${suggestion.upperClubId}`,
    titleKey: 'bag.practice.reduce_overlap.title',
    descriptionKey: 'bag.practice.reduce_overlap.description',
    targetClubs: [suggestion.lowerClubId, suggestion.upperClubId],
    targetSampleCount: 12,
    sourceSuggestionId: suggestion.id,
  };
}

function mapCalibrateSuggestion(suggestion: BagSuggestion): BagPracticeRecommendation | null {
  if (!suggestion.clubId) return null;

  const needsMoreSamples = suggestion.severity !== 'high';

  return {
    id: `practice_calibrate:${suggestion.clubId}`,
    titleKey: 'bag.practice.calibrate.title',
    descriptionKey: needsMoreSamples
      ? 'bag.practice.calibrate.more_samples.description'
      : 'bag.practice.calibrate.no_data.description',
    targetClubs: [suggestion.clubId],
    targetSampleCount: needsMoreSamples ? 10 : 8,
    sourceSuggestionId: suggestion.id,
  };
}

export function buildBagPracticeRecommendation(
  overview: BagReadinessOverview | null | undefined,
  suggestions?: BagSuggestion[] | null,
): BagPracticeRecommendation | null {
  try {
    if (!overview) return null;
    if (overview.readiness.grade === 'excellent') return null;

    const suggestion = (suggestions ?? overview.suggestions ?? [])[0];
    if (!suggestion) return null;

    if (suggestion.type === 'fill_gap') return mapFillGapSuggestion(suggestion);
    if (suggestion.type === 'reduce_overlap') return mapOverlapSuggestion(suggestion);
    if (suggestion.type === 'calibrate') return mapCalibrateSuggestion(suggestion);

    return null;
  } catch (err) {
    console.warn('[bag] Failed to build practice recommendation', err);
    return null;
  }
}

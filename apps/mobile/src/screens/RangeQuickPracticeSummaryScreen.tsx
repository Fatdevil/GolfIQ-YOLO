import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';
import { t } from '@app/i18n';
import { RangeSessionStoryCard } from '@app/range/RangeSessionStoryCard';
import { buildRangeSessionStory } from '@app/range/rangeSessionStory';
import { getMissionById } from '@app/range/rangeMissions';
import { buildTempoStory } from '@app/range/tempoStory';
import { evaluateTempoMissionProgress } from '@app/range/tempoMissionEvaluator';
import { saveLastRangeSessionSummary } from '@app/range/rangeSummaryStorage';
import { appendRangeHistoryEntry } from '@app/range/rangeHistoryStorage';

const directionCopy: Record<'left' | 'right' | 'straight', string> = {
  left: 'Left',
  right: 'Right',
  straight: 'Straight',
};

const MAX_REFLECTION_LENGTH = 280;

type Props = NativeStackScreenProps<RootStackParamList, 'RangeQuickPracticeSummary'>;

export default function RangeQuickPracticeSummaryScreen({ navigation, route }: Props): JSX.Element {
  const summary = route.params?.summary;
  const [sessionRating, setSessionRating] = useState<number | undefined>(summary?.sessionRating);
  const [reflectionNotes, setReflectionNotes] = useState(summary?.reflectionNotes ?? '');
  const hasPersistedRef = useRef(false);

  const tendencyLabel = useMemo(() => {
    if (!summary?.tendency) return '—';
    return directionCopy[summary.tendency];
  }, [summary?.tendency]);

  const story = useMemo(() => {
    if (!summary) return null;
    return buildRangeSessionStory(summary);
  }, [summary]);

  const tempoStory = useMemo(() => {
    if (!summary) return null;
    return buildTempoStory({
      avgTempoRatio: summary.avgTempoRatio,
      tempoSampleCount: summary.tempoSampleCount,
      minTempoRatio: summary.minTempoRatio,
      maxTempoRatio: summary.maxTempoRatio,
    });
  }, [summary]);

  const summaryWithReflection = useMemo(() => {
    if (!summary) return null;
    const trimmedNotes = reflectionNotes.trim();
    return {
      ...summary,
      sessionRating,
      reflectionNotes: trimmedNotes.length ? trimmedNotes : undefined,
    };
  }, [reflectionNotes, sessionRating, summary]);

  const persistSummary = useCallback(async () => {
    if (!summaryWithReflection) return;
    if (hasPersistedRef.current) return;
    hasPersistedRef.current = true;
    await Promise.allSettled([
      Promise.resolve(saveLastRangeSessionSummary(summaryWithReflection)),
      Promise.resolve(appendRangeHistoryEntry(summaryWithReflection)),
    ]);
  }, [summaryWithReflection]);

  const handleNavigateWithSave = useCallback(
    async (action: (updatedSummary: NonNullable<typeof summaryWithReflection>) => void) => {
      if (!summaryWithReflection) return;
      await persistSummary();
      action(summaryWithReflection);
    },
    [persistSummary, summaryWithReflection],
  );

  const handleRatingPress = useCallback((value: number) => {
    setSessionRating((current) => (current === value ? undefined : value));
  }, []);

  const onChangeNotes = useCallback((value: string) => {
    setReflectionNotes(value.slice(0, MAX_REFLECTION_LENGTH));
  }, []);

  const targetLabel = useMemo(() => {
    if (!summary?.targetDistanceM) return null;
    const delta = summary.avgCarryM != null ? Math.round(summary.avgCarryM - summary.targetDistanceM) : null;
    const deltaText = typeof delta === 'number' && !Number.isNaN(delta) ? ` (${delta >= 0 ? '+' : ''}${delta} m vs target)` : '';
    return `Target: ${Math.round(summary.targetDistanceM)} m${deltaText}`;
  }, [summary?.avgCarryM, summary?.targetDistanceM]);

  const mission = summary?.missionId ? getMissionById(summary.missionId) : undefined;
  const missionTitleKey = summary?.missionTitleKey || mission?.titleKey;
  const missionTitle = missionTitleKey ? t(missionTitleKey as any) : summary?.missionId ?? null;

  const tempoMissionProgress = useMemo(() => {
    if (!summary || !mission) return null;
    return evaluateTempoMissionProgress(mission, summary);
  }, [mission, summary]);

  const tempoMissionCopy = useMemo(() => {
    if (!summary || !mission || !tempoMissionProgress?.isTempoMission) return null;

    const required = mission.tempoRequiredSamples ?? 0;
    const samples = tempoMissionProgress.totalTempoSamples ?? 0;
    const avgText = summary.avgTempoRatio != null ? summary.avgTempoRatio.toFixed(1) : null;
    const lowerText = tempoMissionProgress.lowerBound != null ? tempoMissionProgress.lowerBound.toFixed(1) : null;
    const upperText = tempoMissionProgress.upperBound != null ? tempoMissionProgress.upperBound.toFixed(1) : null;

    if (!tempoMissionProgress.eligible) {
      return t('range.missions.tempo.not_enough_data', { samples, required });
    }

    if (!avgText || !lowerText || !upperText) return null;

    if (tempoMissionProgress.completed) {
      return t('range.missions.tempo.completed', { avg: avgText, lower: lowerText, upper: upperText });
    }

    return t('range.missions.tempo.outside_band', { avg: avgText, lower: lowerText, upper: upperText });
  }, [mission, summary, tempoMissionProgress]);

  if (!summary) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Session ended</Text>
        <Text style={styles.subtitle}>No summary available.</Text>
        <TouchableOpacity onPress={() => navigation.navigate('RangePractice')} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Back to Range</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quick Practice summary</Text>
      <Text style={styles.subtitle}>
        {summary.club ? `Club: ${summary.club}` : 'No club selected'}
        {summary.targetDistanceM ? ` • Target ${Math.round(summary.targetDistanceM)} m` : ''}
      </Text>

      {missionTitle ? (
        <View style={styles.goalCard}>
          <Text style={styles.sectionTitle}>{t('range.missions.session_label')}</Text>
          <Text style={styles.helper}>{missionTitle}</Text>
          {tempoMissionCopy ? <Text style={styles.helper}>{tempoMissionCopy}</Text> : null}
        </View>
      ) : null}

      {summary.trainingGoalText ? (
        <View style={styles.goalCard}>
          <Text style={styles.sectionTitle}>{t('range.trainingGoal.summary_label')}</Text>
          <Text style={styles.helper}>{summary.trainingGoalText}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Shots</Text>
          <Text style={styles.value}>{summary.shotCount}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Avg carry</Text>
          <View style={styles.valueColumn}>
            <Text style={styles.value}>{summary.avgCarryM != null ? `${Math.round(summary.avgCarryM)} m` : '—'}</Text>
            {targetLabel ? <Text style={styles.helper}>{targetLabel}</Text> : null}
          </View>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Tendency</Text>
          <Text style={styles.value}>{tendencyLabel}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('range.tempo.title')}</Text>
        {summary.avgTempoRatio != null && summary.tempoSampleCount ? (
          <Text style={styles.helper}>{t('range.tempo.session_avg', { ratio: summary.avgTempoRatio.toFixed(1), count: summary.tempoSampleCount })}</Text>
        ) : (
          <Text style={styles.helper}>{t('range.tempo.no_data')}</Text>
        )}
        {summary.avgTempoBackswingMs != null || summary.avgTempoDownswingMs != null ? (
          <Text style={styles.helper}>
            {summary.avgTempoBackswingMs != null ? `${Math.round(summary.avgTempoBackswingMs)} ms backswing` : '—'} ·{' '}
            {summary.avgTempoDownswingMs != null ? `${Math.round(summary.avgTempoDownswingMs)} ms downswing` : '—'}
          </Text>
        ) : null}
        {tempoStory ? (
          <View style={styles.helperGroup} testID="tempo-story">
            <Text style={styles.helperBold}>{t(tempoStory.titleKey as any, tempoStory.params)}</Text>
            <Text style={styles.helper}>{t(tempoStory.bodyKey as any, tempoStory.params)}</Text>
          </View>
        ) : null}
      </View>

      {story ? (
        <RangeSessionStoryCard story={story} />
      ) : (
        <View style={styles.fallbackCard}>
          <Text style={styles.sectionTitle}>{t('range.story.fallback_title')}</Text>
          <Text style={styles.helper}>{t('range.story.fallback_body')}</Text>
        </View>
      )}

      <View style={styles.reflectionCard}>
        <Text style={styles.sectionTitle}>{t('range.reflection.title')}</Text>
        <Text style={styles.helper}>{t('range.reflection.subtitle')}</Text>

        <View style={styles.reflectionSection}>
          <Text style={styles.label}>{t('range.reflection.title')}</Text>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((value) => {
              const isActive = sessionRating === value;
              return (
                <TouchableOpacity
                  key={value}
                  accessibilityLabel={t('range.reflection.rating_label', { rating: value })}
                  onPress={() => handleRatingPress(value)}
                  style={[styles.ratingButton, isActive && styles.ratingButtonActive]}
                  testID={`reflection-rating-${value}`}
                >
                  <Text style={[styles.ratingText, isActive && styles.ratingTextActive]}>{value}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.reflectionSection}>
          <Text style={styles.label}>{t('range.reflection.section_title')}</Text>
          <TextInput
            value={reflectionNotes}
            onChangeText={onChangeNotes}
            placeholder={t('range.reflection.placeholder')}
            multiline
            style={styles.textArea}
            maxLength={MAX_REFLECTION_LENGTH}
            testID="reflection-notes"
          />
          <Text style={styles.helper}>{`${reflectionNotes.length}/${MAX_REFLECTION_LENGTH}`}</Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={() =>
          handleNavigateWithSave((updatedSummary) =>
            navigation.navigate('RangeSessionDetail', { summary: updatedSummary }),
          )
        }
        style={styles.detailButton}
        testID="summary-view-details"
      >
        <Text style={styles.detailButtonText}>{t('range.sessionDetail.view_button')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => handleNavigateWithSave(() => navigation.navigate('HomeDashboard'))}
        style={styles.primaryButton}
        testID="summary-back-home"
      >
        <Text style={styles.primaryButtonText}>Back to Home</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => handleNavigateWithSave(() => navigation.navigate('RangePractice'))}
        style={styles.secondaryButton}
        testID="summary-back-range"
      >
        <Text style={styles.secondaryButtonText}>Back to Range</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => handleNavigateWithSave(() => navigation.navigate('RangeHistory'))}
        style={styles.tertiaryButton}
        testID="summary-range-history"
      >
        <Text style={styles.tertiaryButtonText}>{t('range.history.view_history')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 12,
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#4B5563',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  card: {
    marginTop: 8,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: '#6B7280',
    fontWeight: '600',
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  valueColumn: {
    alignItems: 'flex-end',
  },
  helper: {
    color: '#6B7280',
  },
  helperBold: {
    color: '#111827',
    fontWeight: '600',
  },
  helperGroup: {
    gap: 4,
  },
  fallbackCard: {
    marginTop: 4,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    gap: 6,
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '600',
  },
  tertiaryButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  tertiaryButtonText: {
    color: '#2563EB',
    fontWeight: '600',
  },
  detailButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  detailButtonText: {
    color: '#2563EB',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  goalCard: {
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  reflectionCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  reflectionSection: {
    gap: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  ratingButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  ratingText: {
    fontWeight: '700',
    color: '#111827',
  },
  ratingTextActive: {
    color: '#FFFFFF',
  },
  textArea: {
    minHeight: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    textAlignVertical: 'top',
  },
});

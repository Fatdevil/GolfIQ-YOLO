import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';
import { t } from '@app/i18n';
import { RangeSessionStoryCard } from '@app/range/RangeSessionStoryCard';
import { buildRangeSessionStory } from '@app/range/rangeSessionStory';

const directionCopy: Record<'left' | 'right' | 'straight', string> = {
  left: 'Left',
  right: 'Right',
  straight: 'Straight',
};

type Props = NativeStackScreenProps<RootStackParamList, 'RangeQuickPracticeSummary'>;

export default function RangeQuickPracticeSummaryScreen({ navigation, route }: Props): JSX.Element {
  const summary = route.params?.summary;

  const tendencyLabel = useMemo(() => {
    if (!summary?.tendency) return '—';
    return directionCopy[summary.tendency];
  }, [summary?.tendency]);

  const story = useMemo(() => {
    if (!summary) return null;
    return buildRangeSessionStory(summary);
  }, [summary]);

  const targetLabel = useMemo(() => {
    if (!summary?.targetDistanceM) return null;
    const delta = summary.avgCarryM != null ? Math.round(summary.avgCarryM - summary.targetDistanceM) : null;
    const deltaText = typeof delta === 'number' && !Number.isNaN(delta) ? ` (${delta >= 0 ? '+' : ''}${delta} m vs target)` : '';
    return `Target: ${Math.round(summary.targetDistanceM)} m${deltaText}`;
  }, [summary?.avgCarryM, summary?.targetDistanceM]);

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

      {story ? (
        <RangeSessionStoryCard story={story} />
      ) : (
        <View style={styles.fallbackCard}>
          <Text style={styles.sectionTitle}>{t('range.story.fallback_title')}</Text>
          <Text style={styles.helper}>{t('range.story.fallback_body')}</Text>
        </View>
      )}

      <TouchableOpacity onPress={() => navigation.navigate('PlayerHome')} style={styles.primaryButton} testID="summary-back-home">
        <Text style={styles.primaryButtonText}>Back to Home</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigation.navigate('RangePractice')}
        style={styles.secondaryButton}
        testID="summary-back-range"
      >
        <Text style={styles.secondaryButtonText}>Back to Range</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.navigate('RangeHistory')}
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
  goalCard: {
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
});

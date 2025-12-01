import React, { useMemo } from 'react';
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { RangeSessionStoryCard } from '@app/range/RangeSessionStoryCard';
import { formatRangeSessionShareText } from '@app/range/rangeSessionShare';
import { buildRangeSessionStory } from '@app/range/rangeSessionStory';
import { getMissionById } from '@app/range/rangeMissions';

const directionCopy: Record<'left' | 'right' | 'straight', string> = {
  left: t('range.sessionDetail.tendency_left'),
  right: t('range.sessionDetail.tendency_right'),
  straight: t('range.sessionDetail.tendency_straight'),
};

type Props = NativeStackScreenProps<RootStackParamList, 'RangeSessionDetail'>;

function formatDate(value?: string): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RangeSessionDetailScreen({ route }: Props): JSX.Element {
  const summary = route.params?.summary;
  const savedAt = route.params?.savedAt;

  const story = useMemo(() => {
    if (!summary) return null;
    return buildRangeSessionStory(summary);
  }, [summary]);

  if (!summary) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('range.sessionDetail.unavailable_title')}</Text>
        <Text style={styles.subtitle}>{t('range.sessionDetail.unavailable_body')}</Text>
      </View>
    );
  }

  const clubLabel = summary.club?.trim() || t('home.range.lastSession.anyClub');
  const completedAt = summary.finishedAt ?? savedAt ?? summary.startedAt;
  const subtitle = t('range.sessionDetail.subtitle', {
    date: formatDate(completedAt),
    club: clubLabel,
    shots: summary.shotCount,
  });

  const tendencyLabel = summary.tendency ? directionCopy[summary.tendency] : '—';

  const missionTitleKey = summary.missionTitleKey || getMissionById(summary.missionId ?? '')?.titleKey;
  const missionDescriptionKey = summary.missionId ? getMissionById(summary.missionId)?.descriptionKey : undefined;
  const missionTitle = missionTitleKey ? t(missionTitleKey as any) : summary.missionId ?? null;
  const missionDescription = missionDescriptionKey ? t(missionDescriptionKey as any) : null;

  const handleShare = async (): Promise<void> => {
    try {
      const text = formatRangeSessionShareText(summary, t);
      await Share.share({ message: text });
    } catch (error) {
      console.warn('[range] Failed to share session', error);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('range.sessionDetail.title')}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {missionTitle ? (
        <View style={styles.goalCard}>
          <Text style={styles.sectionTitle}>{t('range.missions.session_label')}</Text>
          <Text style={styles.helper}>{missionTitle}</Text>
          {missionDescription ? <Text style={styles.helper}>{missionDescription}</Text> : null}
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
          <Text style={styles.label}>{t('range.sessionDetail.shots_label')}</Text>
          <Text style={styles.value}>{summary.shotCount}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t('range.sessionDetail.avg_carry_label')}</Text>
          <Text style={styles.value}>
            {typeof summary.avgCarryM === 'number' && !Number.isNaN(summary.avgCarryM)
              ? `${Math.round(summary.avgCarryM)} m`
              : '—'}
          </Text>
        </View>
        {summary.targetDistanceM != null ? (
          <View style={styles.row}>
            <Text style={styles.label}>{t('range.sessionDetail.target_label')}</Text>
            <Text style={styles.value}>{`${Math.round(summary.targetDistanceM)} m`}</Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.label}>{t('range.sessionDetail.tendency_label')}</Text>
          <Text style={styles.value}>{tendencyLabel}</Text>
        </View>
      </View>

      {story ? <RangeSessionStoryCard story={story} /> : null}

      <TouchableOpacity style={styles.primaryButton} onPress={handleShare} testID="share-range-session">
        <Text style={styles.primaryButtonText}>{t('range.sessionDetail.share_button')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    gap: 12,
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
  helper: {
    color: '#6B7280',
  },
  goalCard: {
    marginTop: 4,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

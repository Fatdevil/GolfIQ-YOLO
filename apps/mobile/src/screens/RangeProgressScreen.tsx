import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { t } from '@app/i18n';
import { computeRangeProgressStats } from '@app/range/rangeProgressStats';
import { loadRangeHistory, markSessionsSharedToCoach } from '@app/range/rangeHistoryStorage';
import { formatCoachSummaryText, pickRecentCoachSummarySessions } from '@app/range/rangeCoachSummary';
import { loadCurrentTrainingGoal } from '@app/range/rangeTrainingGoalStorage';
import { loadRangeMissionState } from '@app/range/rangeMissionsStorage';

function formatDate(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RangeProgressScreen(): JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof loadRangeHistory>>>([]);
  const [trainingGoal, setTrainingGoal] = useState<Awaited<ReturnType<typeof loadCurrentTrainingGoal>>>(null);
  const [missionState, setMissionState] = useState<Awaited<ReturnType<typeof loadRangeMissionState>>>(
    () => ({ completedMissionIds: [] }),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [entries, goal, missions] = await Promise.all([
          loadRangeHistory(),
          loadCurrentTrainingGoal(),
          loadRangeMissionState(),
        ]);
        if (!cancelled) {
          setHistory(entries);
          setTrainingGoal(goal);
          setMissionState(missions);
        }
      } catch {
        if (!cancelled) {
          setHistory([]);
          setTrainingGoal(null);
          setMissionState({ completedMissionIds: [] });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => computeRangeProgressStats(history), [history]);

  const timeRangeLabel = useMemo(() => {
    const start = formatDate(stats.firstSessionDate);
    const end = formatDate(stats.lastSessionDate);
    if (start && end) {
      if (start === end) {
        return t('range.progress.time_range_single', { date: start });
      }
      return t('range.progress.time_range_range', { start, end });
    }
    if (start) return t('range.progress.time_range_single', { date: start });
    return null;
  }, [stats.firstSessionDate, stats.lastSessionDate]);

  const hasQualityData = stats.recentContactPct != null || stats.recentLeftRightBias !== undefined;

  const handleShare = async (): Promise<void> => {
    try {
      const ctx = { history, trainingGoal, missionState };
      const text = formatCoachSummaryText(ctx, t);
      await Share.share({ message: text });

      const recentIds = pickRecentCoachSummarySessions(history).map((entry) => entry.summary.id);
      if (recentIds.length > 0) {
        await markSessionsSharedToCoach(recentIds);
        setHistory((prev) =>
          prev.map((entry) =>
            recentIds.includes(entry.summary.id)
              ? { ...entry, summary: { ...entry.summary, sharedToCoach: true } }
              : entry,
          ),
        );
      }
    } catch (error) {
      console.warn('[range] Failed to share coach summary', error);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('range.progress.screen_title')}</Text>
        <Text style={styles.subtitle}>{t('range.history.loading')}</Text>
      </View>
    );
  }

  if (stats.sessionCount === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('range.progress.empty_title')}</Text>
        <Text style={styles.subtitle}>{t('range.progress.empty_subtitle')}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('range.progress.screen_title')}</Text>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleShare}
        disabled={history.length === 0}
        testID="share-coach-summary"
      >
        <Text style={styles.primaryButtonText}>{t('range.coachSummary.share_button')}</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('range.progress.overview_title')}</Text>
        <Text style={styles.cardHighlight}>
          {t('range.progress.overview_line', {
            sessions: stats.sessionCount,
            shots: stats.totalRecordedShots,
          })}
        </Text>
        {timeRangeLabel ? <Text style={styles.helper}>{timeRangeLabel}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('range.progress.clubs_title')}</Text>
        {stats.mostRecordedClubs.length === 0 ? (
          <Text style={styles.helper}>{t('range.progress.clubs_empty')}</Text>
        ) : (
          <View style={styles.list}>
            {stats.mostRecordedClubs.map((item) => (
              <View style={styles.listItem} key={`${item.club}-${item.shotCount}`}>
                <Text style={styles.cardHighlight}>
                  {t('range.progress.clubs_line', { club: item.club, shots: item.shotCount })}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('range.progress.recent_quality_title')}</Text>
        <Text style={styles.helper}>
          {t('range.progress.recent_quality_sample', {
            sessions: stats.recentSampleSize.sessions,
            shots: stats.recentSampleSize.shots,
          })}
        </Text>

        {hasQualityData ? (
          <View style={styles.list}>
            {stats.recentContactPct != null ? (
              <Text style={styles.cardHighlight}>
                {t('range.progress.recent_quality_contact', { percent: stats.recentContactPct })}
              </Text>
            ) : null}

            {stats.recentLeftRightBias === 'left' ? (
              <Text style={styles.cardHighlight}>{t('range.progress.recent_quality_bias_left')}</Text>
            ) : null}
            {stats.recentLeftRightBias === 'right' ? (
              <Text style={styles.cardHighlight}>{t('range.progress.recent_quality_bias_right')}</Text>
            ) : null}
            {stats.recentLeftRightBias === 'balanced' ? (
              <Text style={styles.cardHighlight}>{t('range.progress.recent_quality_bias_balanced')}</Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.helper}>{t('range.progress.recent_quality_need_more')}</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
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
  card: {
    marginTop: 8,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  cardHighlight: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  helper: {
    color: '#6B7280',
  },
  list: {
    gap: 6,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    opacity: 1,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

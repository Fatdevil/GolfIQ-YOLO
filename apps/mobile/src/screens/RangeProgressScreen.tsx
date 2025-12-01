import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { t } from '@app/i18n';
import { computeRangeProgressStats } from '@app/range/rangeProgressStats';
import { loadRangeHistory } from '@app/range/rangeHistoryStorage';

function formatDate(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RangeProgressScreen(): JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof loadRangeHistory>>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await loadRangeHistory();
        if (!cancelled) {
          setHistory(entries);
        }
      } catch {
        if (!cancelled) {
          setHistory([]);
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
});

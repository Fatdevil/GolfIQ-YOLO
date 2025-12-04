import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  fetchWeeklySummary,
  type WeeklyStrokesGained,
  type WeeklySummaryCategory,
} from '@app/api/weeklySummary';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'WeeklySummary'>;

const CATEGORY_ORDER: Array<{ key: keyof NonNullable<ReturnType<typeof buildCategoryMap>>; label: string }> = [
  { key: 'driving', label: t('weeklySummary.categories.driving') },
  { key: 'approach', label: t('weeklySummary.categories.approach') },
  { key: 'short_game', label: t('weeklySummary.categories.short_game') },
  { key: 'putting', label: t('weeklySummary.categories.putting') },
];

function buildCategoryMap(categories: Record<string, WeeklySummaryCategory>): {
  driving?: WeeklySummaryCategory;
  approach?: WeeklySummaryCategory;
  short_game?: WeeklySummaryCategory;
  putting?: WeeklySummaryCategory;
} {
  return categories ?? {};
}

function buildSgCategoryMap(categories: WeeklyStrokesGained['categories'] | undefined): {
  driving?: WeeklyStrokesGained['categories'][keyof WeeklyStrokesGained['categories']];
  approach?: WeeklyStrokesGained['categories'][keyof WeeklyStrokesGained['categories']];
  short_game?: WeeklyStrokesGained['categories'][keyof WeeklyStrokesGained['categories']];
  putting?: WeeklyStrokesGained['categories'][keyof WeeklyStrokesGained['categories']];
} {
  return categories ?? {};
}

function formatPeriod(from: string, to: string): string {
  const fromDate = new Date(from);
  const toDate = new Date(to);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return `${from} – ${to}`;
  }

  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return t('weeklySummary.period', {
    from: fromDate.toLocaleDateString(undefined, opts),
    to: toDate.toLocaleDateString(undefined, opts),
  });
}

function formatNumber(value?: number | null): string {
  if (value == null) return '—';
  return value.toFixed(Number.isInteger(value) ? 0 : 1);
}

function formatToPar(value?: string | null): string {
  if (!value) return '—';
  return value;
}

function trendSymbol(trend?: WeeklySummaryCategory['trend']): string {
  if (trend === 'up') return '↑';
  if (trend === 'down') return '↓';
  return '→';
}

function formatSgValue(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

export default function WeeklySummaryScreen({ navigation }: Props): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchWeeklySummary>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWeeklySummary()
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError(t('weeklySummary.error'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const hasRounds = summary?.period.roundCount && summary.period.roundCount > 0;
  const categories = useMemo(
    () => buildCategoryMap(summary?.categories ?? {}),
    [summary?.categories],
  );
  const strokesGained = summary?.strokesGained ?? null;
  const sgCategories = useMemo(
    () => buildSgCategoryMap(strokesGained?.categories),
    [strokesGained?.categories],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>{t('weeklySummary.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity
          onPress={() => {
            setLoading(true);
            setError(null);
            setSummary(null);
            fetchWeeklySummary()
              .then((data) => {
                setSummary(data);
                setError(null);
              })
              .catch(() => setError(t('weeklySummary.error')))
              .finally(() => setLoading(false));
          }}
          testID="weekly-summary-retry"
        >
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{t('weeklySummary.retry')}</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('weeklySummary.title')}</Text>
      {summary ? (
        <>
          <Text style={styles.period}>{formatPeriod(summary.period.from, summary.period.to)}</Text>
          <View style={styles.card}>
            <Text style={styles.headline} testID="weekly-headline">
              {summary.headline.emoji ? `${summary.headline.emoji} ` : ''}
              {summary.headline.text}
            </Text>
          </View>

          {hasRounds ? (
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('weeklySummary.coreStats')}</Text>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>{t('weeklySummary.avgScore')}</Text>
                  <Text style={styles.statValue}>{formatNumber(summary.coreStats.avgScore)}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>{t('weeklySummary.bestScore')}</Text>
                  <Text style={styles.statValue}>{formatNumber(summary.coreStats.bestScore)}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>{t('weeklySummary.worstScore')}</Text>
                  <Text style={styles.statValue}>{formatNumber(summary.coreStats.worstScore)}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>{t('weeklySummary.avgToPar')}</Text>
                  <Text style={styles.statValue}>{formatToPar(summary.coreStats.avgToPar)}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>{t('weeklySummary.holesPlayed')}</Text>
                  <Text style={styles.statValue}>{formatNumber(summary.coreStats.holesPlayed)}</Text>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('weeklySummary.categories.title')}</Text>
                <View style={styles.categoryGrid}>
                  {CATEGORY_ORDER.map(({ key, label }) => {
                    const category = categories[key];
                    return (
                      <View key={key} style={styles.categoryTile} testID={`weekly-category-${key}`}>
                        <Text style={styles.categoryLabel}>{label}</Text>
                        <Text style={styles.categoryGrade}>
                          {category?.grade ?? '—'} <Text style={styles.trend}>{trendSymbol(category?.trend)}</Text>
                        </Text>
                        <Text style={styles.muted}>{category?.note ?? t('weeklySummary.noCategoryData')}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('strokesGained.weeklySectionTitle')}</Text>
                {strokesGained ? (
                  <>
                    <View style={styles.statRow}>
                      <Text style={styles.statLabel}>{t('strokesGained.totalLabel')}</Text>
                      <Text
                        style={[
                          styles.statValue,
                          (strokesGained.total ?? 0) >= 0 ? styles.sgPositive : styles.sgNegative,
                        ]}
                      >
                        {formatSgValue(strokesGained.total)}
                      </Text>
                    </View>
                    <View style={styles.categoryGrid}>
                      {CATEGORY_ORDER.map(({ key, label }) => {
                        const category = sgCategories[key];
                        return (
                          <View key={`sg-${key}`} style={styles.categoryTile} testID={`weekly-sg-${key}`}>
                            <Text style={styles.categoryLabel}>{label}</Text>
                            <Text
                              style={[
                                styles.categoryGrade,
                                (category?.value ?? 0) >= 0 ? styles.sgPositive : styles.sgNegative,
                              ]}
                            >
                              {formatSgValue(category?.value ?? 0)} {category?.grade ?? '—'}
                            </Text>
                            <Text style={styles.muted}>
                              {category?.label ?? t('weeklySummary.noCategoryData')}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <Text style={styles.muted}>{t('strokesGained.weeklyUnavailable')}</Text>
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('weeklySummary.focusTitle')}</Text>
                {summary.focusHints.length === 0 ? (
                  <Text style={styles.muted}>{t('weeklySummary.noHints')}</Text>
                ) : (
                  summary.focusHints.map((hint, index) => (
                    <Text key={hint} style={styles.hint}>
                      • {hint}
                    </Text>
                  ))
                )}
              </View>
            </>
          ) : (
            <View style={styles.card}>
              <Text style={styles.emptyTitle}>{t('weeklySummary.notEnough')}</Text>
              <Text style={styles.muted}>{t('weeklySummary.playMore')}</Text>
            </View>
          )}
        </>
      ) : null}

      <View style={styles.ctaRow}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('RoundHistory')}
          accessibilityLabel={t('weeklySummary.viewRounds')}
          testID="weekly-summary-history"
        >
          <Text style={styles.primaryButtonText}>{t('weeklySummary.viewRounds')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, styles.secondaryButton]}
          onPress={() => navigation.navigate('PracticePlanner')}
          accessibilityLabel={t('practice_planner_title')}
          testID="weekly-summary-practice"
        >
          <Text style={styles.primaryButtonText}>{t('practice_planner_title')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0c0f',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f5f5f7',
  },
  period: {
    color: '#b6b6c2',
    marginBottom: 4,
  },
  headline: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f5f5f7',
  },
  card: {
    backgroundColor: '#16171f',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f5f5f7',
    marginBottom: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    color: '#b6b6c2',
  },
  statValue: {
    color: '#f5f5f7',
    fontWeight: '600',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryTile: {
    width: '48%',
    backgroundColor: '#1f202a',
    padding: 12,
    borderRadius: 10,
  },
  categoryLabel: {
    color: '#f5f5f7',
    fontWeight: '600',
    marginBottom: 4,
  },
  categoryGrade: {
    fontSize: 18,
    color: '#f5f5f7',
    marginBottom: 4,
  },
  trend: {
    color: '#7dd3fc',
    fontSize: 14,
  },
  sgPositive: {
    color: '#22c55e',
  },
  sgNegative: {
    color: '#f87171',
  },
  hint: {
    color: '#f5f5f7',
  },
  muted: {
    color: '#8a8a94',
  },
  error: {
    color: '#ff8a8a',
    textAlign: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#00c853',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: '#2a2b35',
  },
  primaryButtonText: {
    color: '#0c0c0f',
    fontWeight: '700',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f5f5f7',
    marginBottom: 4,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
});


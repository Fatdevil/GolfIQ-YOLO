import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchRoundRecap, listRoundSummaries, type RoundSummary } from '@app/api/roundClient';
import { fetchPlayerCategoryStats, type PlayerCategoryStats } from '@app/api/statsClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { computePlayerStats } from '@app/stats/playerStatsEngine';
import { safeEmit } from '@app/telemetry';
import { buildStrokesGainedLightTrend, type StrokesGainedLightTrend } from '@shared/stats/strokesGainedLight';
import { SgLightExplainerModal } from '@app/components/SgLightExplainerModal';

type Props = NativeStackScreenProps<RootStackParamList, 'PlayerStats'>;

export function formatPercentage(value?: number | null): string {
  if (value == null) return '—';
  return `${value.toFixed(0)}%`;
}

export function formatCategoryAverage(value?: number | null): string {
  if (value == null) return '—';
  return `${value.toFixed(1)} ${t('stats.player.categories.per_round')}`;
}

function formatAverageScore(avgScore?: number | null, avgToPar?: number | null): string {
  if (avgScore == null) return '—';
  const diffLabel =
    avgToPar != null
      ? ` (${avgToPar === 0 ? t('round.history.even_par') : `${avgToPar > 0 ? '+' : ''}${avgToPar.toFixed(1)}`})`
      : '';
  return `${avgScore.toFixed(1)}${diffLabel}`;
}

function formatSgDelta(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  const rounded = Number(value.toFixed(1));
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}`;
}

export default function PlayerStatsScreen({ navigation }: Props): JSX.Element {
  const [summaries, setSummaries] = useState<RoundSummary[]>([]);
  const [categoryStats, setCategoryStats] = useState<PlayerCategoryStats | null>(null);
  const [summariesLoading, setSummariesLoading] = useState(true);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [sgLightTrend, setSgLightTrend] = useState<StrokesGainedLightTrend | null>(null);
  const [sgLightLoading, setSgLightLoading] = useState(true);
  const [sgLightExplainerVisible, setSgLightExplainerVisible] = useState(false);
  const trendImpressionSent = useRef(false);

  useEffect(() => {
    let cancelled = false;

    setSummariesLoading(true);
    listRoundSummaries(50)
      .then((roundData) => {
        if (cancelled) return;
        setSummaries(roundData);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError(t('stats.player.load_error'));
      })
      .finally(() => {
        if (!cancelled) setSummariesLoading(false);
      });

    setCategoryLoading(true);
    fetchPlayerCategoryStats()
      .then((categoryData) => {
        if (cancelled) return;
        setCategoryStats(categoryData);
        setCategoryError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setCategoryError(t('stats.player.categories.unavailable'));
        }
      })
      .finally(() => {
        if (!cancelled) setCategoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSgLightLoading(true);
    trendImpressionSent.current = false;

    if (!summaries?.length) {
      setSgLightTrend(null);
      setSgLightLoading(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const recaps = await Promise.all(
          summaries
            .slice(0, 8)
            .map((summary) =>
              fetchRoundRecap(summary.roundId).catch((err) => {
                console.warn('[player-stats] failed to load recap for trend', err);
                return null;
              }),
            ),
        );

        if (cancelled) return;

        const sgRounds = recaps
          .map((recap) =>
            recap?.strokesGainedLight
              ? {
                  ...recap.strokesGainedLight,
                  roundId: recap.roundId,
                  playedAt: recap.date,
                }
              : null,
          )
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

        const trend = buildStrokesGainedLightTrend(sgRounds, { windowSize: 5 });
        setSgLightTrend(trend);
      } catch (err) {
        console.warn('[player-stats] unable to build sg light trend', err);
        setSgLightTrend(null);
      } finally {
        if (!cancelled) {
          setSgLightLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [summaries]);

  const stats = useMemo(() => computePlayerStats(summaries), [summaries]);
  const hasRounds = stats.roundsPlayed > 0;
  const sgLightFocusCategory = sgLightTrend?.focusHistory?.[0]?.focusCategory ?? null;

  const openSgLightExplainer = useCallback(() => {
    safeEmit('sg_light_explainer_opened', { surface: 'player_stats' });
    setSgLightExplainerVisible(true);
  }, []);

  const closeSgLightExplainer = useCallback(() => setSgLightExplainerVisible(false), []);

  useEffect(() => {
    if (!sgLightTrend || !sgLightFocusCategory || trendImpressionSent.current) return;
    trendImpressionSent.current = true;
    safeEmit('practice_focus_entry_shown', {
      surface: 'mobile_stats_sg_light_trend',
      focusCategory: sgLightFocusCategory,
    });
  }, [sgLightFocusCategory, sgLightTrend]);

  if (summariesLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>{t('stats.player.loading')}</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('stats.player.title')}</Text>
      <Text style={styles.subtitle}>{t('stats.player.subtitle')}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!hasRounds ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>{t('stats.player.empty_title')}</Text>
          <Text style={styles.muted}>{t('stats.player.empty_body')}</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('RoundHistory')}
            accessibilityLabel={t('stats.player.view_rounds')}
            testID="player-stats-empty-cta"
          >
            <Text style={styles.primaryButtonText}>{t('stats.player.view_rounds')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <StatRow label={t('stats.player.rounds')} value={`${stats.roundsPlayed}`} />
          <StatRow
            label={t('stats.player.avg_score')}
            value={formatAverageScore(stats.avgScore, stats.avgToPar)}
          />
          <StatRow
            label={t('stats.player.avg_putts')}
            value={stats.avgPutts != null ? stats.avgPutts.toFixed(1) : '—'}
          />
          <StatRow label={t('stats.player.fir')} value={formatPercentage(stats.firPct)} />
          <StatRow label={t('stats.player.gir')} value={formatPercentage(stats.girPct)} />
        </View>
      )}

      <View style={styles.card} testID="player-stats-sg-trend-card">
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{t('stats.player.sg_light.trend_title')}</Text>
          <TouchableOpacity
            onPress={openSgLightExplainer}
            accessibilityLabel={t('sg_light.explainer.open_label')}
            style={styles.infoButton}
            testID="open-sg-light-explainer"
          >
            <Text style={styles.infoIcon}>i</Text>
          </TouchableOpacity>
        </View>
        {sgLightLoading ? (
          <ActivityIndicator />
        ) : sgLightTrend ? (
          <>
            <Text style={styles.muted}>
              {t('stats.player.sg_light.trend_subtitle', { rounds: sgLightTrend.windowSize })}
            </Text>
            {sgLightFocusCategory ? (
              <View style={styles.statRow}>
                <Text style={styles.statLabel} testID="player-stats-sg-trend-headline">
                  {t('stats.player.sg_light.trend_focus', {
                    focus: t(
                      sgLightFocusCategory === 'tee'
                        ? 'sg_light.focus.off_the_tee'
                        : `sg_light.focus.${sgLightFocusCategory}`,
                    ),
                  })}
                </Text>
                <Text style={styles.statValue}>
                  {formatSgDelta(sgLightTrend.perCategory?.[sgLightFocusCategory]?.avgDelta)}
                </Text>
              </View>
            ) : null}

            {sgLightTrend.focusHistory?.length ? (
              <View style={styles.focusHistory}>
                <Text style={styles.muted}>{t('stats.player.sg_light.focus_history')}</Text>
                <View style={styles.focusBadges}>
                  {sgLightTrend.focusHistory.slice(0, 4).map((entry) => (
                    <Text key={entry.roundId} style={styles.focusBadge}>
                      {t(
                        entry.focusCategory === 'tee'
                          ? 'sg_light.focus.off_the_tee'
                          : `sg_light.focus.${entry.focusCategory}`,
                      )}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            {sgLightFocusCategory ? (
              <TouchableOpacity
                style={[styles.primaryButton, styles.secondaryButton]}
                onPress={() => {
                  safeEmit('practice_focus_entry_clicked', {
                    surface: 'mobile_stats_sg_light_trend',
                    focusCategory: sgLightFocusCategory,
                  });
                  navigation.navigate('PracticeMissions', {
                    source: 'mobile_stats_sg_light_trend',
                    practiceRecommendationSource: 'mobile_stats_sg_light_trend',
                    strokesGainedLightFocusCategory: sgLightFocusCategory,
                  });
                }}
                accessibilityLabel={t('stats.player.sg_light.practice_cta')}
                testID="player-stats-sg-trend-cta"
              >
                <Text style={styles.primaryButtonText}>{t('stats.player.sg_light.practice_cta')}</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <Text style={styles.muted}>{t('stats.player.sg_light.trend_empty')}</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('stats.player.categories.title')}</Text>
        <Text style={styles.muted}>{t('stats.player.categories.subtitle')}</Text>

        {categoryLoading ? (
          <ActivityIndicator />
        ) : categoryStats ? (
          categoryStats.roundsCount === 0 ? (
            <Text style={styles.muted}>{t('stats.player.categories.empty')}</Text>
          ) : (
            <>
              <CategoryRow
                label={t('stats.player.categories.tee')}
                value={formatCategoryAverage(categoryStats.avgTeeShotsPerRound)}
                pct={formatPercentage(categoryStats.teePct)}
              />
              <CategoryRow
                label={t('stats.player.categories.approach')}
                value={formatCategoryAverage(categoryStats.avgApproachShotsPerRound)}
                pct={formatPercentage(categoryStats.approachPct)}
              />
              <CategoryRow
                label={t('stats.player.categories.short_game')}
                value={formatCategoryAverage(categoryStats.avgShortGameShotsPerRound)}
                pct={formatPercentage(categoryStats.shortGamePct)}
              />
              <CategoryRow
                label={t('stats.player.categories.putting')}
                value={formatCategoryAverage(categoryStats.avgPuttsPerRound)}
                pct={formatPercentage(categoryStats.puttingPct)}
              />
              <Text style={styles.muted}>{t('stats.player.categories.note')}</Text>
            </>
          )
        ) : (
          <Text style={styles.muted}>{categoryError ?? t('stats.player.categories.unavailable')}</Text>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, styles.secondaryButton]}
          onPress={() => navigation.navigate('CategoryStats')}
          accessibilityLabel={t('stats.player.categories.view_breakdown')}
          testID="player-stats-view-categories"
          disabled={categoryLoading}
        >
          <Text style={styles.primaryButtonText}>{t('stats.player.categories.view_breakdown')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, { marginTop: 12 }]}
        onPress={() => navigation.navigate('RoundHistory')}
        accessibilityLabel={t('stats.player.view_rounds')}
        testID="player-stats-view-rounds"
      >
        <Text style={styles.primaryButtonText}>{t('stats.player.view_rounds')}</Text>
      </TouchableOpacity>
    </ScrollView>
    <SgLightExplainerModal
      visible={sgLightExplainerVisible}
      onClose={closeSgLightExplainer}
      t={t}
    />
    </>
  );
}

function StatRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function CategoryRow({
  label,
  value,
  pct,
}: {
  label: string;
  value: string;
  pct: string;
}): JSX.Element {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.categoryValues}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.categoryPct}>{pct}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#6b7280', marginBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  muted: { color: '#6b7280', marginTop: 4 },
  error: { color: '#b91c1c' },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  primaryButton: {
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  secondaryButton: { marginTop: 8 },
  primaryButtonText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statLabel: { color: '#374151' },
  statValue: { fontWeight: '700', fontSize: 16 },
  categoryValues: { alignItems: 'flex-end' },
  categoryPct: { color: '#6b7280' },
  focusHistory: { gap: 4 },
  focusBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  focusBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    color: '#111827',
    fontWeight: '600',
  },
  infoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  infoIcon: { color: '#111827', fontWeight: '700' },
});

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { listRoundSummaries, type RoundSummary } from '@app/api/roundClient';
import { fetchPlayerCategoryStats, type PlayerCategoryStats } from '@app/api/statsClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { computePlayerStats } from '@app/stats/playerStatsEngine';

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

export default function PlayerStatsScreen({ navigation }: Props): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<RoundSummary[]>([]);
  const [categoryStats, setCategoryStats] = useState<PlayerCategoryStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listRoundSummaries(50), fetchPlayerCategoryStats()])
      .then(([roundData, categoryData]) => {
        if (cancelled) return;
        setSummaries(roundData);
        setCategoryStats(categoryData);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError(t('stats.player.load_error'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => computePlayerStats(summaries), [summaries]);
  const hasRounds = stats.roundsPlayed > 0;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>{t('stats.player.loading')}</Text>
      </View>
    );
  }

  return (
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

      {categoryStats ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('stats.player.categories.title')}</Text>
          <Text style={styles.muted}>{t('stats.player.categories.subtitle')}</Text>

          {categoryStats.roundsCount === 0 ? (
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
          )}

          <TouchableOpacity
            style={[styles.primaryButton, styles.secondaryButton]}
            onPress={() => navigation.navigate('CategoryStats')}
            accessibilityLabel={t('stats.player.categories.view_breakdown')}
            testID="player-stats-view-categories"
          >
            <Text style={styles.primaryButtonText}>{t('stats.player.categories.view_breakdown')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.primaryButton, { marginTop: 12 }]}
        onPress={() => navigation.navigate('RoundHistory')}
        accessibilityLabel={t('stats.player.view_rounds')}
        testID="player-stats-view-rounds"
      >
        <Text style={styles.primaryButtonText}>{t('stats.player.view_rounds')}</Text>
      </TouchableOpacity>
    </ScrollView>
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
});

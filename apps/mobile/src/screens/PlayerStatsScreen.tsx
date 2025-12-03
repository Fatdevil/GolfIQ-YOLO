import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { listRoundSummaries, type RoundSummary } from '@app/api/roundClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { computePlayerStats } from '@app/stats/playerStatsEngine';

type Props = NativeStackScreenProps<RootStackParamList, 'PlayerStats'>;

function formatPercentage(value?: number | null): string {
  if (value == null) return '—';
  return `${value.toFixed(0)}%`;
}

function formatAverageScore(avgScore?: number | null, avgToPar?: number | null): string {
  if (avgScore == null) return '—';
  const diffLabel =
    avgToPar != null ? ` (${avgToPar === 0 ? t('round.history.even_par') : `${avgToPar > 0 ? '+' : ''}${avgToPar.toFixed(1)}`})` : '';
  return `${avgScore.toFixed(1)}${diffLabel}`;
}

export default function PlayerStatsScreen({ navigation }: Props): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<RoundSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    listRoundSummaries(50)
      .then((data) => {
        if (!cancelled) setSummaries(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => computePlayerStats(summaries), [summaries]);

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

      {stats.roundsPlayed === 0 ? (
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#6b7280', marginBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  muted: { color: '#6b7280', marginTop: 4 },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  primaryButton: {
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statLabel: { color: '#374151' },
  statValue: { fontWeight: '700', fontSize: 16 },
});

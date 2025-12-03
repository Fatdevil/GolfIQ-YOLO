import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchPlayerCategoryStats, type PlayerCategoryStats } from '@app/api/statsClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';

import { CategoryRow, formatCategoryAverage, formatPercentage } from './PlayerStatsScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'CategoryStats'>;

export default function CategoryStatsScreen({}: Props): JSX.Element {
  const [stats, setStats] = useState<PlayerCategoryStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchPlayerCategoryStats()
      .then((response) => {
        if (!cancelled) setStats(response);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
      <Text style={styles.title}>{t('stats.player.categories.detail_title')}</Text>
      <Text style={styles.subtitle}>{t('stats.player.categories.detail_subtitle')}</Text>

      {stats == null || stats.roundsCount === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>{t('stats.player.categories.empty')}</Text>
          <Text style={styles.muted}>{t('stats.player.categories.detail_empty_body')}</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <CategoryRow
            label={t('stats.player.categories.tee')}
            value={formatCategoryAverage(stats.avgTeeShotsPerRound)}
            pct={formatPercentage(stats.teePct)}
          />
          <CategoryRow
            label={t('stats.player.categories.approach')}
            value={formatCategoryAverage(stats.avgApproachShotsPerRound)}
            pct={formatPercentage(stats.approachPct)}
          />
          <CategoryRow
            label={t('stats.player.categories.short_game')}
            value={formatCategoryAverage(stats.avgShortGameShotsPerRound)}
            pct={formatPercentage(stats.shortGamePct)}
          />
          <CategoryRow
            label={t('stats.player.categories.putting')}
            value={formatCategoryAverage(stats.avgPuttsPerRound)}
            pct={formatPercentage(stats.puttingPct)}
          />
          <Text style={styles.muted}>{t('stats.player.categories.detail_footer')}</Text>
        </View>
      )}
    </ScrollView>
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
});

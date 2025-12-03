import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { listRoundSummaries, listRounds, type RoundInfo, type RoundSummary } from '@app/api/roundClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RoundHistory'>;

type RoundRow = {
  info: RoundInfo;
  summary?: RoundSummary;
};

function formatDate(value?: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatScore(summary?: RoundSummary): string {
  if (!summary || summary.totalStrokes == null) {
    return t('round.history.no_score');
  }
  if (summary.totalToPar != null) {
    const diff = summary.totalToPar;
    const label = diff === 0 ? t('round.history.even_par') : `${diff > 0 ? '+' : ''}${diff}`;
    return `${summary.totalStrokes} (${label})`;
  }
  return `${summary.totalStrokes}`;
}

function formatStats(summary?: RoundSummary): string {
  if (!summary) return t('round.history.no_stats');
  const putts = summary.totalPutts != null ? summary.totalPutts : '—';
  const fir =
    summary.fairwaysHit != null && summary.fairwaysTotal != null
      ? `${summary.fairwaysHit}/${summary.fairwaysTotal}`
      : '—';
  const gir = summary.girCount != null ? summary.girCount : '—';
  return t('round.history.stats_line', { putts, fir, gir });
}

export default function RoundHistoryScreen({ navigation }: Props): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [rounds, setRounds] = useState<RoundInfo[]>([]);
  const [summaries, setSummaries] = useState<RoundSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listRounds(50), listRoundSummaries(50)])
      .then(([roundList, summaryList]) => {
        if (cancelled) return;
        setRounds(roundList);
        setSummaries(summaryList);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const rows: RoundRow[] = useMemo(() => {
    const summariesById = new Map(summaries.map((s) => [s.roundId, s] as const));
    return rounds
      .map((info) => ({ info, summary: summariesById.get(info.id) }))
      .sort((a, b) => {
        const aDate = new Date(a.info.endedAt || a.info.startedAt || 0).getTime();
        const bDate = new Date(b.info.endedAt || b.info.startedAt || 0).getTime();
        return bDate - aDate;
      });
  }, [rounds, summaries]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>{t('round.history.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('round.history.title')}</Text>
      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t('round.history.empty_title')}</Text>
          <Text style={styles.muted}>{t('round.history.empty_body')}</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('RoundStart')}
            accessibilityLabel={t('round.history.empty_cta')}
            testID="round-history-empty-cta"
          >
            <Text style={styles.primaryButtonText}>{t('round.history.empty_cta')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        rows.map(({ info, summary }) => (
          <TouchableOpacity
            key={info.id}
            style={styles.card}
            onPress={() => navigation.navigate('RoundSummary', { roundId: info.id })}
            accessibilityLabel={t('round.history.view_round')}
            testID="round-history-item"
          >
            <View style={styles.rowHeader}>
              <Text style={styles.date}>{formatDate(info.endedAt || info.startedAt)}</Text>
              <Text style={styles.score}>{formatScore(summary)}</Text>
            </View>
            <Text style={styles.course}>{info.courseName || t('round.history.unnamed_course')}</Text>
            <Text style={styles.stats}>{formatStats(summary)}</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  muted: { color: '#6b7280', marginTop: 4 },
  empty: { padding: 16, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { color: '#111827', fontWeight: '600' },
  course: { fontSize: 16, fontWeight: '700' },
  score: { fontSize: 16, fontWeight: '700', color: '#111827' },
  stats: { color: '#374151' },
  primaryButton: {
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getRoundSummary, listRoundShots, type RoundSummary, type Shot } from '@app/api/roundClient';
import type { RootStackParamList } from '@app/navigation/types';
import { t } from '@app/i18n';

export default function RoundSummaryScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'RoundSummary'>): JSX.Element {
  const { roundId } = route.params ?? { roundId: '' };
  const [summary, setSummary] = useState<RoundSummary | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<any>(null);
  const [shotsOffset, setShotsOffset] = useState(0);
  const ScrollViewComponent: any = ScrollView;

  useEffect(() => {
    let cancelled = false;
    Promise.all([getRoundSummary(roundId), listRoundShots(roundId)])
      .then(([sum, shotList]) => {
        if (cancelled) return;
        setSummary(sum);
        setShots(shotList);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roundId]);

  const grouped = useMemo(() => {
    const map = new Map<number, Shot[]>();
    shots.forEach((shot) => {
      const holeShots = map.get(shot.holeNumber) ?? [];
      holeShots.push(shot);
      map.set(shot.holeNumber, holeShots);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [shots]);

  const scoreLabel = useMemo(() => {
    if (!summary) return 'No scores yet';
    if (summary.totalStrokes != null && summary.totalPar != null && summary.totalToPar != null) {
      const sign = summary.totalToPar > 0 ? '+' : '';
      return `Total: ${summary.totalStrokes} (${sign}${summary.totalToPar} vs ${summary.totalPar})`;
    }
    if (summary.totalStrokes != null) {
      return `Total strokes: ${summary.totalStrokes}`;
    }
    return 'No scores yet';
  }, [summary]);

  const handleScrollToShots = useCallback(() => {
    scrollRef.current?.scrollTo({ y: shotsOffset, animated: true });
  }, [shotsOffset]);

  const handleShotLayout = useCallback((event: any) => {
    setShotsOffset(event?.nativeEvent?.layout?.y ?? 0);
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading round…</Text>
      </View>
    );
  }

  return (
    <ScrollViewComponent style={styles.container} ref={scrollRef} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Round summary</Text>
      {summary ? (
        <View style={styles.summaryCard}>
          <Text style={styles.scoreLine}>{scoreLabel}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Putts</Text>
              <Text style={styles.statValue}>{summary.totalPutts ?? '—'}</Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Fairways</Text>
              <Text style={styles.statValue}>
                {summary.fairwaysHit != null && summary.fairwaysTotal != null
                  ? `${summary.fairwaysHit}/${summary.fairwaysTotal}`
                  : '—'}
              </Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>GIR</Text>
              <Text style={styles.statValue}>{summary.girCount ?? '—'}</Text>
            </View>
          </View>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('RoundScorecard', { roundId })}
              accessibilityLabel="View scorecard"
            >
              <Text style={styles.actionText}>View scorecard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleScrollToShots}
              accessibilityLabel="View shot list"
            >
              <Text style={styles.actionText}>View shot list</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={styles.muted}>No scores logged.</Text>
      )}

      <View style={styles.holeBlock} onLayout={handleShotLayout as any} testID="shot-list">
        <Text style={styles.sectionTitle}>Shots</Text>
        {grouped.length === 0 ? (
          <Text style={styles.muted}>No shots logged.</Text>
        ) : (
          grouped.map(([hole, holeShots]) => (
            <View key={hole} style={styles.shotsForHole}>
              <Text style={styles.holeTitle}>Hole {hole}</Text>
              {holeShots.map((shot) => (
                <View key={shot.id} style={styles.shotRow}>
                  <Text style={styles.shotLine}>
                    {shot.club} · {new Date(shot.createdAt).toLocaleTimeString()} {shot.note ? `· ${shot.note}` : ''}
                  </Text>
                  {shot.tempoRatio != null ? (
                    <Text style={styles.tempoText}>{t('round.summary.tempo', { ratio: shot.tempoRatio.toFixed(1) })}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ))
        )}
      </View>
    </ScrollViewComponent>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: {
    color: '#6b7280',
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    marginBottom: 16,
  },
  scoreLine: {
    fontSize: 18,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBlock: {
    flex: 1,
  },
  statLabel: {
    color: '#6b7280',
    marginBottom: 4,
  },
  statValue: {
    fontWeight: '700',
    fontSize: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  actionText: {
    fontWeight: '700',
    color: '#111827',
  },
  holeBlock: {
    marginBottom: 12,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  holeTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  shotsForHole: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  shotRow: {
    paddingVertical: 4,
    gap: 2,
  },
  shotLine: {
    color: '#111827',
  },
  tempoText: {
    color: '#6b7280',
  },
});

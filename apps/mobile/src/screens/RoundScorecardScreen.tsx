import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  getRoundScores,
  getRoundSummary,
  type HoleScore,
  type RoundScores,
  type RoundSummary,
} from '@app/api/roundClient';
import type { RootStackParamList } from '@app/navigation/types';

function sumValues(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((v): v is number => typeof v === 'number');
  return filtered.length ? filtered.reduce((a, b) => a + b, 0) : null;
}

export default function RoundScorecardScreen({ route }: NativeStackScreenProps<RootStackParamList, 'RoundScorecard'>): JSX.Element {
  const roundId = route.params?.roundId ?? '';
  const [scores, setScores] = useState<RoundScores | null>(null);
  const [summary, setSummary] = useState<RoundSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getRoundScores(roundId), getRoundSummary(roundId)])
      .then(([scorecard, roundSummary]) => {
        if (cancelled) return;
        setScores(scorecard);
        setSummary(roundSummary);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [roundId]);

  const holesByNumber = useMemo(() => {
    const map = new Map<number, HoleScore>();
    Object.values(scores?.holes ?? {}).forEach((hole) => {
      map.set(hole.holeNumber, hole);
    });
    return map;
  }, [scores]);

  const buildValues = useCallback(
    (start: number, end: number, field: keyof HoleScore) => {
      const values: Array<number | null> = [];
      for (let i = start; i <= end; i += 1) {
        const hole = holesByNumber.get(i);
        const value = hole ? (hole[field] as number | null | undefined) : null;
        values.push(value ?? null);
      }
      return values;
    },
    [holesByNumber],
  );

  const renderSection = (start: number, end: number, label: string) => {
    const parValues = buildValues(start, end, 'par');
    const strokeValues = buildValues(start, end, 'strokes');
    const puttValues = buildValues(start, end, 'putts');

    return (
      <View style={styles.cardSection}>
        <Text style={styles.sectionTitle}>{label}</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.rowLabel}>Hole</Text>
          {Array.from({ length: end - start + 1 }, (_, idx) => start + idx).map((hole) => (
            <Text key={hole} style={styles.cell}>
              {hole}
            </Text>
          ))}
          <Text style={styles.rowLabel}>Total</Text>
        </View>
        <View style={styles.scoreRow}>
          <Text style={styles.rowLabel}>Par</Text>
          {parValues.map((value, idx) => (
            <Text key={`par-${start + idx}`} style={styles.cell}>
              {value ?? '—'}
            </Text>
          ))}
          <Text style={styles.rowLabel}>{sumValues(parValues) ?? '—'}</Text>
        </View>
        <View style={styles.scoreRow}>
          <Text style={styles.rowLabel}>Strokes</Text>
          {strokeValues.map((value, idx) => (
            <Text key={`strokes-${start + idx}`} style={styles.cell}>
              {value ?? '—'}
            </Text>
          ))}
          <Text style={styles.rowLabel}>{sumValues(strokeValues) ?? '—'}</Text>
        </View>
        <View style={styles.scoreRow}>
          <Text style={styles.rowLabel}>Putts</Text>
          {puttValues.map((value, idx) => (
            <Text key={`putts-${start + idx}`} style={styles.cell}>
              {value ?? '—'}
            </Text>
          ))}
          <Text style={styles.rowLabel}>{sumValues(puttValues) ?? '—'}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading scorecard…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Scorecard</Text>
      {summary ? (
        <View style={styles.summaryBlock}>
          <Text style={styles.scoreLine}>
            {summary.totalStrokes != null && summary.totalPar != null && summary.totalToPar != null
              ? `${summary.totalStrokes} (${summary.totalToPar > 0 ? '+' : ''}${summary.totalToPar})`
              : 'No total yet'}
          </Text>
          <Text style={styles.muted}>Holes played: {summary.holesPlayed}</Text>
        </View>
      ) : null}

      {renderSection(1, 9, 'Front 9')}
      {renderSection(10, 18, 'Back 9')}

      <View style={styles.cardSection}>
        <Text style={styles.sectionTitle}>Totals</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.rowLabel}>Front</Text>
          <Text style={styles.rowLabel}>{summary?.frontStrokes ?? '—'}</Text>
        </View>
        <View style={styles.scoreRow}>
          <Text style={styles.rowLabel}>Back</Text>
          <Text style={styles.rowLabel}>{summary?.backStrokes ?? '—'}</Text>
        </View>
        <View style={styles.scoreRow}>
          <Text style={styles.rowLabel}>Total</Text>
          <Text style={styles.rowLabel}>{summary?.totalStrokes ?? '—'}</Text>
        </View>
      </View>
    </ScrollView>
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
  summaryBlock: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    gap: 4,
    marginBottom: 12,
  },
  scoreLine: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardSection: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowLabel: {
    fontWeight: '700',
    minWidth: 60,
  },
  cell: {
    width: 28,
    textAlign: 'center',
  },
});

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { listRoundShots, type Shot } from '@app/api/roundClient';
import type { RootStackParamList } from '@app/navigation/types';
import { t } from '@app/i18n';

export default function RoundSummaryScreen({ route }: NativeStackScreenProps<RootStackParamList, 'RoundSummary'>): JSX.Element {
  const { roundId } = route.params ?? { roundId: '' };
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listRoundShots(roundId)
      .then((data) => {
        if (!cancelled) setShots(data);
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading shots…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Round summary</Text>
      {grouped.length === 0 ? (
        <Text style={styles.muted}>No shots logged.</Text>
      ) : (
        grouped.map(([hole, holeShots]) => (
          <View key={hole} style={styles.holeBlock}>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
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
  holeBlock: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  holeTitle: {
    fontWeight: '700',
    marginBottom: 4,
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

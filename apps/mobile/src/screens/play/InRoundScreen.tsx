import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchCourseBundle, type CourseBundle } from '@app/api/courses';
import type { RootStackParamList } from '@app/navigation/types';
import { clearCurrentRun, loadCurrentRun, saveCurrentRun, type CurrentRun } from '@app/run/currentRun';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type Props = NativeStackScreenProps<RootStackParamList, 'PlayInRound'>;

export default function InRoundScreen({ navigation, route }: Props): JSX.Element {
  const [run, setRun] = useState<CurrentRun | null>(null);
  const [bundle, setBundle] = useState<CourseBundle | null>(route.params?.bundle ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const storedRun = await loadCurrentRun();
      if (!storedRun) {
        navigation.navigate('PlayerHome');
        return;
      }
      setRun(storedRun);
      if (!bundle) {
        const fetched = await fetchCourseBundle(storedRun.courseId);
        setBundle(fetched);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load round';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [bundle, navigation]);

  useEffect(() => {
    hydrate().catch(() => {
      /* handled */
    });
  }, [hydrate]);

  const hole = useMemo(() => {
    if (!bundle || !run) return null;
    const safeHole = clamp(run.currentHole, 1, run.holes);
    const found = bundle.holes.find((h) => h.number === safeHole);
    return found ?? null;
  }, [bundle, run]);

  const handleAdvance = useCallback(
    async (delta: number) => {
      if (!run) return;
      const nextHole = clamp(run.currentHole + delta, 1, run.holes);
      const updated = { ...run, currentHole: nextHole } as CurrentRun;
      setRun(updated);
      await saveCurrentRun(updated);
    },
    [run],
  );

  const handleEnd = useCallback(async () => {
    await clearCurrentRun();
    navigation.navigate('PlayerHome');
  }, [navigation]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Loading round…</Text>
      </View>
    );
  }

  if (error || !run) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText} testID="inround-error">{error ?? 'No active round'}</Text>
        <TouchableOpacity onPress={() => hydrate().catch(() => {})} testID="inround-retry">
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Try again</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  const tee = bundle?.tees.find((t) => t.id === run.teeId);
  const teeLabel = tee?.lengthMeters ? `${tee.name} – ${tee.lengthMeters} m` : tee?.name ?? run.teeName;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{run.courseName}</Text>
        <Text style={styles.subtitle}>{teeLabel}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} testID="hole-progress">
          Hole {run.currentHole} of {run.holes}
        </Text>
        <View style={styles.holeCard}>
          <Text style={styles.holeLabel}>Par {hole?.par ?? '–'}</Text>
          <Text style={styles.holeMeta}>Index {hole?.index ?? '–'}</Text>
          <Text style={styles.holeMeta}>Length {hole?.lengthMeters ? `${hole.lengthMeters} m` : '– m'}</Text>
        </View>
        <View style={styles.row}>
          <TouchableOpacity
            onPress={() => handleAdvance(-1).catch(() => {})}
            disabled={run.currentHole <= 1}
            testID="prev-hole"
          >
            <View style={[styles.secondaryButton, run.currentHole <= 1 && styles.buttonDisabled]}>
              <Text style={styles.secondaryButtonText}>Previous hole</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleAdvance(1).catch(() => {})}
            disabled={run.currentHole >= run.holes}
            testID="next-hole"
          >
            <View style={[styles.primaryButton, run.currentHole >= run.holes && styles.buttonDisabled]}>
              <Text style={styles.primaryButtonText}>Next hole</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footerCard}>
        <Text style={styles.footerTitle}>Scoring & caddie</Text>
        <Text style={styles.footerText}>Scoring & caddie will appear here in upcoming versions.</Text>
      </View>

      <TouchableOpacity onPress={() => handleEnd().catch(() => {})} testID="end-round">
        <View style={styles.destructiveButton}>
          <Text style={styles.destructiveText}>End round</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6b7280',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  holeCard: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    gap: 4,
  },
  holeLabel: {
    fontWeight: '700',
    fontSize: 16,
  },
  holeMeta: {
    color: '#6b7280',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  primaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#111827',
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#111827',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  footerCard: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    gap: 4,
  },
  footerTitle: {
    fontWeight: '700',
    color: '#c2410c',
  },
  footerText: {
    color: '#9a3412',
  },
  destructiveButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc2626',
  },
  destructiveText: {
    color: '#dc2626',
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '700',
    textAlign: 'center',
  },
});

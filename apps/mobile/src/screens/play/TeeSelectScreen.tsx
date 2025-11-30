import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchCourseBundle, type CourseBundle } from '@app/api/courses';
import type { RootStackParamList } from '@app/navigation/types';
import { CURRENT_RUN_VERSION, saveCurrentRun, type RoundMode, type CurrentRun } from '@app/run/currentRun';

const HOLE_OPTIONS = [9, 18];

type Props = NativeStackScreenProps<RootStackParamList, 'PlayTeeSelect'>;

type TeeSelection = { id: string; name: string; lengthMeters?: number };

type ModeOption = { label: string; value: RoundMode };

const MODES: ModeOption[] = [
  { label: 'Stroke play', value: 'strokeplay' },
  { label: 'Practice', value: 'practice' },
];

export default function TeeSelectScreen({ navigation, route }: Props): JSX.Element {
  const params = route.params ?? { courseId: '', courseName: '', tees: undefined };
  const { courseId, courseName } = params;
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    bundle: CourseBundle | null;
  }>({ loading: true, error: null, bundle: null });
  const [selectedTee, setSelectedTee] = useState<TeeSelection | null>(null);
  const [holes, setHoles] = useState<number>(18);
  const [mode, setMode] = useState<RoundMode>('strokeplay');

  const load = useCallback(async () => {
    if (!courseId) {
      setState({ loading: false, error: 'Missing course', bundle: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const bundle = await fetchCourseBundle(courseId);
      setState({ loading: false, error: null, bundle });
      setSelectedTee(bundle.tees[0] ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load tees';
      setState({ loading: false, error: message, bundle: null });
    }
  }, [courseId]);

  useEffect(() => {
    load().catch(() => {
      /* handled */
    });
  }, [load]);

  const teeLabel = useCallback((tee: TeeSelection) => {
    if (tee.lengthMeters) {
      return `${tee.name} – ${tee.lengthMeters} m`;
    }
    return tee.name;
  }, []);

  const holeOptions = useMemo(() => HOLE_OPTIONS, []);

  const handleStart = useCallback(async () => {
    if (!state.bundle || !selectedTee) return;
    const run: CurrentRun = {
      schemaVersion: CURRENT_RUN_VERSION,
      courseId: state.bundle.id,
      courseName: state.bundle.name ?? courseName,
      teeId: selectedTee.id,
      teeName: selectedTee.name,
      holes,
      mode,
      startedAt: new Date().toISOString(),
      currentHole: 1,
      scorecard: {},
    } as const;

    await saveCurrentRun(run);
    navigation.navigate('PlayInRound', {
      courseId: run.courseId,
      courseName: run.courseName,
      teeId: run.teeId,
      teeName: run.teeName,
      bundle: state.bundle,
    });
  }, [courseName, holes, mode, navigation, selectedTee, state.bundle]);

  if (state.loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Loading tees…</Text>
      </View>
    );
  }

  if (state.error || !state.bundle) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText} testID="tees-error">{state.error ?? 'Missing bundle'}</Text>
        <TouchableOpacity onPress={() => load().catch(() => {})} testID="tees-retry">
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{state.bundle.name}</Text>
      <Text style={styles.subtitle}>Select your tee box</Text>

      <View style={styles.section}>
        {state.bundle.tees.map((tee) => (
          <TouchableOpacity
            key={tee.id}
            onPress={() => setSelectedTee(tee)}
            testID={`tee-${tee.id}`}
            accessibilityLabel={tee.name}
          >
            <View style={[styles.card, selectedTee?.id === tee.id && styles.cardSelected]}>
              <Text style={styles.cardTitle}>{teeLabel(tee)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Holes</Text>
        <View style={styles.row}>
          {holeOptions.map((option) => (
            <TouchableOpacity key={option} onPress={() => setHoles(option)} testID={`holes-${option}`}>
              <View style={[styles.pill, holes === option && styles.pillSelected]}>
                <Text style={[styles.pillText, holes === option && styles.pillTextSelected]}>{option}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mode</Text>
        <View style={styles.row}>
          {MODES.map((option) => (
            <TouchableOpacity key={option.value} onPress={() => setMode(option.value)} testID={`mode-${option.value}`}>
              <View style={[styles.pill, mode === option.value && styles.pillSelected]}>
                <Text style={[styles.pillText, mode === option.value && styles.pillTextSelected]}>{option.label}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        disabled={!selectedTee}
        onPress={() => handleStart().catch(() => {})}
        testID="start-round"
      >
        <View style={[styles.primaryButton, !selectedTee && styles.primaryButtonDisabled]}>
          <Text style={styles.primaryButtonText}>Start round</Text>
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
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6b7280',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  card: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardSelected: {
    borderColor: '#111827',
    backgroundColor: '#e0f2fe',
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  pillSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  pillText: {
    color: '#111827',
    fontWeight: '700',
  },
  pillTextSelected: {
    color: '#fff',
  },
  primaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 16,
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

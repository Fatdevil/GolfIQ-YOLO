import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ApiError } from '@app/api/client';
import { fetchActiveRoundSummary, getCurrentRound, startRound, type ActiveRoundSummary, type RoundInfo } from '@app/api/roundClient';
import { fetchCourses, type CourseSummary } from '@app/api/courseClient';
import type { RootStackParamList } from '@app/navigation/types';
import {
  logRoundCreateClicked,
  logRoundCreatedFailed,
  logRoundCreatedSuccess,
  logRoundFlowV2StartRoundRequest,
  logRoundFlowV2StartRoundResponse,
  logRoundResumeClicked,
  logRoundStartOpened,
} from '@app/analytics/roundFlow';
import { loadActiveRoundState, saveActiveRoundState } from '@app/round/roundState';
import { getItem, setItem } from '@app/storage/asyncStorage';
import { getRoundFlowV2Reason, isRoundFlowV2Enabled } from '@shared/featureFlags/roundFlowV2';

const holesOptions = [9, 18];
const TOURNAMENT_SAFE_KEY = 'golfiq.tournamentSafePref.v1';

async function loadTournamentSafePref(): Promise<boolean> {
  const raw = await getItem(TOURNAMENT_SAFE_KEY);
  if (!raw) return false;
  return raw === 'true';
}

async function saveTournamentSafePref(value: boolean): Promise<void> {
  await setItem(TOURNAMENT_SAFE_KEY, value ? 'true' : 'false');
}

function buildResumePayload(summary: ActiveRoundSummary | null, info: RoundInfo | null) {
  if (!summary && !info) return null;

  const roundId = summary?.roundId ?? info?.id;
  if (!roundId) return null;

  const startHole = info?.startHole ?? 1;
  const currentHole = summary?.currentHole ?? info?.lastHole ?? startHole;

  return {
    round: {
      id: roundId,
      holes: info?.holes ?? summary?.holes ?? 18,
      courseId: info?.courseId ?? summary?.courseId,
      courseName: info?.courseName ?? summary?.courseName ?? info?.courseId ?? summary?.courseId,
      teeName: info?.teeName,
      startedAt: info?.startedAt ?? summary?.startedAt ?? new Date().toISOString(),
      startHole,
      status: info?.status ?? 'in_progress',
    },
    currentHole,
  } as const;
}

type Props = NativeStackScreenProps<RootStackParamList, 'StartRoundV2'>;

export default function StartRoundV2Screen({ navigation }: Props): JSX.Element {
  const [activeRound, setActiveRound] = useState<ActiveRoundSummary | null>(null);
  const [activeInfo, setActiveInfo] = useState<RoundInfo | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [courseInput, setCourseInput] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [teeName, setTeeName] = useState('');
  const [holes, setHoles] = useState<number>(18);
  const [loading, setLoading] = useState(true);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tournamentSafe, setTournamentSafe] = useState(false);

  useEffect(() => {
    let cancelled = false;
    logRoundStartOpened();

    (async () => {
      try {
        const [active, current, courseList, cachedState, storedTournamentSafe] = await Promise.all([
          fetchActiveRoundSummary().catch((err) => {
            setActiveError(err instanceof Error ? err.message : 'Unable to load active round');
            return null;
          }),
          getCurrentRound().catch(() => null),
          fetchCourses().catch((err) => {
            setCoursesError(err instanceof Error ? err.message : 'Unable to load courses');
            return [] as CourseSummary[];
          }),
          loadActiveRoundState().catch(() => null),
          loadTournamentSafePref().catch(() => false),
        ]);

        if (cancelled) return;

        setActiveRound(active ?? null);
        setActiveInfo(current ?? null);
        const cachedPreferences = cachedState?.round?.id === current?.id ? cachedState?.preferences : undefined;
        const tournamentSafePref = cachedPreferences?.tournamentSafe ?? storedTournamentSafe;
        setTournamentSafe(Boolean(tournamentSafePref));
        setCourses(courseList ?? []);
        if (courseList?.length) {
          setSelectedCourseId((prev) => prev || courseList[0].id);
          setCourseInput((prev) => prev || courseList[0].name);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const resumePayload = useMemo(() => buildResumePayload(activeRound, activeInfo), [activeInfo, activeRound]);

  const filteredCourses = useMemo(() => {
    if (!courseInput.trim()) return courses;
    const term = courseInput.trim().toLowerCase();
    return courses.filter((course) => `${course.name}${course.city ?? ''}`.toLowerCase().includes(term));
  }, [courseInput, courses]);

  const handleResume = useCallback(async () => {
    if (!resumePayload) return;
    logRoundResumeClicked(resumePayload.round.id);

    const existing = await loadActiveRoundState().catch(() => null);
    const preferences = existing?.preferences ?? (tournamentSafe ? { tournamentSafe } : {});
    const payload = { ...resumePayload, preferences };
    await saveActiveRoundState(payload);
    navigation.navigate('RoundShot', { roundId: resumePayload.round.id });
  }, [navigation, resumePayload, tournamentSafe]);

  const handleStart = useCallback(async () => {
    const selectedCourse = courseInput.trim();
    if (!selectedCourse) {
      Alert.alert('Course required', 'Please choose a course to start your round.');
      return;
    }

    const courseId = selectedCourseId || selectedCourse;
    logRoundCreateClicked({ courseId, holes, teeName });
    const roundFlowV2Enabled = isRoundFlowV2Enabled();
    const roundFlowV2Reason = getRoundFlowV2Reason() ?? 'unknown';
    const startTime = Date.now();
    let reusedActiveRound: boolean | null = null;
    let httpStatus: number | null = null;
    logRoundFlowV2StartRoundRequest({ roundFlowV2Enabled, roundFlowV2Reason, screen: 'StartRoundV2' });
    setSubmitting(true);
    try {
      const round = await startRound({ courseId, teeName: teeName.trim() || undefined, holes, startHole: 1 });
      reusedActiveRound = round.reusedActiveRound ?? null;
      if (round.reusedActiveRound) {
        const [active, current] = await Promise.all([
          fetchActiveRoundSummary().catch(() => null),
          getCurrentRound().catch(() => null),
        ]);
        const payload = buildResumePayload(active, current) ?? {
          round,
          currentHole: round.startHole ?? 1,
        };
        const existing = await loadActiveRoundState().catch(() => null);
        const preferences = existing?.preferences ?? (tournamentSafe ? { tournamentSafe } : {});
        await saveActiveRoundState({ ...payload, preferences });
        navigation.navigate('RoundShot', { roundId: payload.round.id });
        return;
      }
      logRoundCreatedSuccess({ roundId: round.id, courseId: round.courseId ?? courseId, holes: round.holes });
      await saveActiveRoundState({
        round,
        currentHole: round.startHole ?? 1,
        preferences: tournamentSafe ? { tournamentSafe } : {},
      });
      await saveTournamentSafePref(tournamentSafe);
      navigation.navigate('RoundShot', { roundId: round.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to start round';
      logRoundCreatedFailed({ courseId, holes, error: message });
      if (err instanceof ApiError) {
        httpStatus = err.status ?? null;
      }
      Alert.alert('Unable to start round', message);
    } finally {
      setSubmitting(false);
      logRoundFlowV2StartRoundResponse({
        roundFlowV2Enabled,
        roundFlowV2Reason,
        screen: 'StartRoundV2',
        reusedActiveRound,
        httpStatus,
        durationMs: Date.now() - startTime,
      });
    }
  }, [courseInput, holes, navigation, selectedCourseId, teeName, tournamentSafe]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading round details…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Start your round</Text>
      <Text style={styles.subtitle}>Resume quickly or set up a new round with fewer taps.</Text>

      {activeError ? <Text style={styles.error}>{activeError}</Text> : null}

      {resumePayload ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>Resume round</Text>
              <Text style={styles.muted}>
                {(resumePayload.round.courseName ?? 'Course').trim()} · Hole {resumePayload.currentHole}
              </Text>
            </View>
            <Text style={styles.badge}>In progress</Text>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={handleResume} testID="resume-round">
            <Text style={styles.primaryButtonText}>Resume</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Start new round</Text>
        <Text style={styles.muted}>Pick a course, optional tee, and hole count.</Text>

        <Text style={styles.label}>Course</Text>
        <TextInput
          value={courseInput}
          onChangeText={(value) => {
            setCourseInput(value);
            setSelectedCourseId(value);
          }}
          placeholder="Search or enter course"
          style={styles.input}
          accessibilityLabel="Course"
          testID="course-input"
        />
        {coursesError ? <Text style={styles.error}>{coursesError}</Text> : null}

        {filteredCourses.length ? (
          <View style={styles.pillRow}>
            {filteredCourses.slice(0, 4).map((course) => {
              const active = selectedCourseId === course.id || courseInput === course.name;
              return (
                <TouchableOpacity
                  key={course.id}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => {
                    setCourseInput(course.name);
                    setSelectedCourseId(course.id);
                  }}
                  accessibilityLabel={course.name}
                  testID={`course-${course.id}`}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{course.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <Text style={styles.label}>Tee (optional)</Text>
        <TextInput
          value={teeName}
          onChangeText={setTeeName}
          placeholder="e.g. Blue"
          style={styles.input}
          accessibilityLabel="Tee"
          testID="tee-input"
        />

        <Text style={styles.label}>Holes</Text>
        <View style={styles.toggleRow}>
          {holesOptions.map((option) => (
            <TouchableOpacity
              key={option}
              onPress={() => setHoles(option)}
              style={[styles.toggle, holes === option && styles.toggleActive]}
              accessibilityLabel={`${option} holes`}
              testID={`holes-${option}`}
            >
              <Text style={[styles.toggleText, holes === option && styles.toggleTextActive]}>{option} holes</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, submitting && styles.disabled]}
          disabled={submitting}
          onPress={handleStart}
          accessibilityLabel="Start round"
          testID="start-round-button"
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Start round</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: {
    color: '#6b7280',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#4b5563',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: '#ecfeff',
    color: '#0369a1',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
  },
  label: {
    fontWeight: '700',
    color: '#111827',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggle: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  toggleText: {
    fontWeight: '700',
    color: '#111827',
  },
  toggleTextActive: {
    color: '#fff',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pillActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0ea5e9',
  },
  pillText: {
    fontWeight: '700',
    color: '#111827',
  },
  pillTextActive: {
    color: '#0ea5e9',
  },
  disabled: {
    opacity: 0.6,
  },
  error: {
    color: '#b91c1c',
  },
});

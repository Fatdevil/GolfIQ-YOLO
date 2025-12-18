import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getCurrentRound, listRounds, startRound, type RoundInfo } from '@app/api/roundClient';
import { fetchCourses, type CourseSummary } from '@app/api/courseClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { loadActiveRoundState, saveActiveRoundState } from '@app/round/roundState';
import { useGeolocation } from '@app/hooks/useGeolocation';
import { computeNearestCourse, distanceMeters } from '@shared/round/autoHoleCore';
import { getItem, setItem } from '@app/storage/asyncStorage';

const holesOptions = [9, 18];
const COURSE_CACHE_KEY = 'golfiq.courseCache.v1';
const TOURNAMENT_SAFE_KEY = 'golfiq.tournamentSafePref.v1';

async function loadCachedCourses(): Promise<CourseSummary[]> {
  const raw = await getItem(COURSE_CACHE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CourseSummary[];
  } catch {
    return [];
  }
}

async function saveCachedCourses(courses: CourseSummary[]): Promise<void> {
  await setItem(COURSE_CACHE_KEY, JSON.stringify(courses));
}

async function loadTournamentSafePref(): Promise<boolean> {
  const raw = await getItem(TOURNAMENT_SAFE_KEY);
  if (!raw) return false;
  return raw === 'true';
}

async function saveTournamentSafePref(value: boolean): Promise<void> {
  await setItem(TOURNAMENT_SAFE_KEY, value ? 'true' : 'false');
}

type Props = NativeStackScreenProps<RootStackParamList, 'RoundStart'>;

type CourseWithDistance = CourseSummary & { distanceM?: number | null };

type CoursePickerItem = { id: string; label: string; distanceM?: number | null };

export default function StartRoundScreen({ navigation }: Props): JSX.Element {
  const [courseId, setCourseId] = useState('');
  const [teeName, setTeeName] = useState('');
  const [holes, setHoles] = useState<number>(18);
  const [activeRound, setActiveRound] = useState<RoundInfo | null>(null);
  const [activeRoundError, setActiveRoundError] = useState<string | null>(null);
  const [recentRounds, setRecentRounds] = useState<RoundInfo[]>([]);
  const [availableCourses, setAvailableCourses] = useState<CourseSummary[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [courseManuallySet, setCourseManuallySet] = useState(false);
  const [query, setQuery] = useState('');
  const [tournamentSafe, setTournamentSafe] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tournamentSafeRef = useRef(false);
  const updateTournamentSafe = useCallback((value: boolean) => {
    tournamentSafeRef.current = value;
    setTournamentSafe(value);
  }, []);

  const geo = useGeolocation();

  useEffect(() => {
    let cancelled = false;

    async function hydrate(): Promise<void> {
      try {
        const cachedCourses = await loadCachedCourses();
        let fallbackCourses = cachedCourses;
        if (!cancelled && cachedCourses.length) {
          setAvailableCourses(cachedCourses);
          if (!courseId) setCourseId(cachedCourses[0].id);
        }

        const [current, history, courses, storedTournamentSafe, cachedState] = await Promise.all([
          getCurrentRound().catch((err) => {
            setActiveRoundError(err instanceof Error ? err.message : 'Unable to check active round');
            return null;
          }),
          listRounds(5).catch(() => []),
          fetchCourses().catch((err) => {
            setCoursesError(err instanceof Error ? err.message : 'Unable to load courses');
            return null;
          }),
          loadTournamentSafePref().catch(() => false),
          loadActiveRoundState().catch(() => null),
        ]);

        if (cancelled) return;

        const cachedPreferences =
          cachedState?.round?.id && current?.id === cachedState.round.id
            ? cachedState.preferences
            : undefined;
        updateTournamentSafe(cachedPreferences?.tournamentSafe ?? storedTournamentSafe);
        setActiveRound(current ?? null);
        setRecentRounds(history ?? []);

        fallbackCourses = courses && courses.length ? courses : fallbackCourses;
        if (fallbackCourses?.length) {
          setAvailableCourses(fallbackCourses);
          await saveCachedCourses(fallbackCourses);
        }

        const historyCourse = history?.find((r) => r.courseId || r.courseName);
        if (!courseId && historyCourse?.courseId) {
          setCourseId(historyCourse.courseId);
        }
        if (!courseId && fallbackCourses?.length) {
          setCourseId(historyCourse?.courseId ?? fallbackCourses[0].id);
        }
        if (!teeName && historyCourse?.teeName) {
          setTeeName(historyCourse.teeName);
        }
      } catch (err) {
        console.warn('Failed to load round context', err);
      } finally {
        if (!cancelled) {
          setCoursesLoading(false);
          setLoading(false);
        }
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [courseId, teeName, updateTournamentSafe]);

  const courseGeo = useMemo(
    () =>
      availableCourses.map((course) => ({
        id: course.id,
        name: course.name,
        location: course.location ?? null,
      })),
    [availableCourses],
  );

  const autoCourseSuggestion = useMemo(
    () => computeNearestCourse(courseGeo, geo.position),
    [courseGeo, geo.position],
  );

  const coursePickerOptions = useMemo<CoursePickerItem[]>(() => {
    const seen = new Set<string>();
    const items: CoursePickerItem[] = [];

    recentRounds.forEach((round) => {
      const id = round.courseId ?? round.courseName;
      if (!id || seen.has(id)) return;
      seen.add(id);
      items.push({ id, label: round.courseName ?? id });
    });

    availableCourses.forEach((course) => {
      if (seen.has(course.id)) return;
      seen.add(course.id);
      items.push({ id: course.id, label: course.name });
    });

    return items;
  }, [availableCourses, recentRounds]);

  const filteredCourses: CourseWithDistance[] = useMemo(() => {
    const term = query.trim().toLowerCase();
    const withDistance = availableCourses.map((course) => ({
      ...course,
      distanceM:
        geo.supported && geo.position && course.location
          ? distanceMeters(geo.position, course.location)
          : null,
    }));

    if (!term) return withDistance;
    return withDistance.filter((course) =>
      `${course.name}${course.city ?? ''}${course.country ?? ''}`.toLowerCase().includes(term),
    );
  }, [availableCourses, geo.position, geo.supported, query]);

  const nearbyCourses = useMemo(() => {
    if (!geo.supported || !geo.position) return [] as CourseWithDistance[];
    return filteredCourses
      .filter((course) => course.distanceM != null)
      .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
      .slice(0, 3);
  }, [filteredCourses, geo.position, geo.supported]);

  const recentCourseOptions = useMemo(() => {
    const ids = new Set<string>();
    const courses: CourseWithDistance[] = [];
    recentRounds.forEach((round) => {
      const id = round.courseId ?? round.courseName;
      if (!id || ids.has(id)) return;
      ids.add(id);
      const matched = filteredCourses.find((course) => course.id === id);
      if (matched) {
        courses.push(matched);
      } else {
        courses.push({
          id,
          name: round.courseName ?? id,
          holeCount: round.holes ?? 18,
          distanceM: null,
        });
      }
    });
    return courses;
  }, [filteredCourses, recentRounds]);

  const selectedCourseOption = useMemo(
    () => coursePickerOptions.find((course) => course.id === courseId) ?? null,
    [courseId, coursePickerOptions],
  );

  const teeSuggestions = useMemo(() => {
    const matches = recentRounds.filter((round) => round.courseId === courseId);
    const tees = matches.map((round) => round.teeName).filter(Boolean) as string[];
    return Array.from(new Set(tees));
  }, [courseId, recentRounds]);

  const resolvedCourseId = useMemo(() => {
    if (
      !courseManuallySet &&
      autoCourseSuggestion.confidence !== 'low' &&
      autoCourseSuggestion.suggestedCourseId
    ) {
      return autoCourseSuggestion.suggestedCourseId;
    }
    return courseId.trim();
  }, [autoCourseSuggestion.confidence, autoCourseSuggestion.suggestedCourseId, courseId, courseManuallySet]);

  useEffect(() => {
    if (courseManuallySet) return;
    if (!autoCourseSuggestion.suggestedCourseId) return;
    if (autoCourseSuggestion.confidence === 'low') return;
    setCourseId(autoCourseSuggestion.suggestedCourseId);
  }, [autoCourseSuggestion.confidence, autoCourseSuggestion.suggestedCourseId, courseManuallySet]);

  useEffect(() => {
    tournamentSafeRef.current = tournamentSafe;
  }, [tournamentSafe]);

  useEffect(() => {
    if (teeName || !courseId) return;
    const suggestedTee = teeSuggestions[0];
    if (suggestedTee) setTeeName(suggestedTee);
  }, [courseId, teeName, teeSuggestions]);

  const handleResume = useCallback(async () => {
    if (!activeRound) return;
    const existingState = await loadActiveRoundState();
    const startHole = activeRound.startHole ?? 1;
    const resumeHole = Math.min(
      activeRound.lastHole ?? startHole,
      (activeRound.holes as number | undefined) ?? 18,
    );
    const cachedPreferences =
      existingState?.round?.id === activeRound.id ? existingState?.preferences ?? {} : undefined;
    const mergedPreferences = {
      ...(cachedPreferences ?? {}),
      tournamentSafe: tournamentSafeRef.current,
    };
    await saveActiveRoundState({
      round: {
        id: activeRound.id,
        holes: activeRound.holes,
        courseId: activeRound.courseId,
        courseName: activeRound.courseName,
        teeName: activeRound.teeName,
        startedAt: activeRound.startedAt,
        startHole,
        status: activeRound.status,
      },
      currentHole: resumeHole,
      preferences: mergedPreferences,
    });
    navigation.navigate('RoundShot', { roundId: activeRound.id });
  }, [activeRound, navigation]);

  const handleStart = useCallback(async () => {
    const trimmedCourse = resolvedCourseId;
    if (!trimmedCourse) {
      Alert.alert(t('start_round.course_label'), t('start_round.course_required'));
      return;
    }
    setSubmitting(true);
    try {
      const currentTournamentSafe = tournamentSafeRef.current;
      const round = await startRound({
        courseId: trimmedCourse,
        teeName: teeName.trim() || undefined,
        holes,
        startHole: 1,
      });
      await saveTournamentSafePref(currentTournamentSafe);
      await saveActiveRoundState({
        round,
        currentHole: round.startHole ?? 1,
        preferences: { tournamentSafe: currentTournamentSafe },
      });
      navigation.navigate('RoundShot', { roundId: round.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('start_round.error');
      Alert.alert(t('start_round.error_title'), message);
      if (!activeRound) {
        const current = await getCurrentRound().catch(() => null);
        setActiveRound(current ?? null);
      }
    } finally {
      setSubmitting(false);
    }
  }, [activeRound, holes, navigation, resolvedCourseId, teeName]);

  const handleScrollToForm = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 120, behavior: 'smooth' });
  }, []);

  const renderCourseOption = useCallback(
    (course: CourseWithDistance) => {
      const isSelected = courseId === course.id || selectedCourseOption?.label === course.name;
      return (
        <TouchableOpacity
          key={course.id}
          style={[styles.pillButton, isSelected && styles.pillButtonActive]}
          onPress={() => {
            setCourseId(course.id);
            setCourseManuallySet(true);
          }}
          accessibilityLabel={course.name}
          testID={`course-${course.id}`}
        >
          <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{course.name}</Text>
          {course.distanceM != null ? (
            <Text style={styles.pillMeta}>{`${Math.round(course.distanceM)} m away`}</Text>
          ) : null}
        </TouchableOpacity>
      );
    },
    [courseId, selectedCourseOption?.label],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>{t('start_round.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('start_round.title')}</Text>
      <Text style={styles.subtitle}>Fast start · Resume where you left off</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('start_round.quick_actions')}</Text>
        {activeRound ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleResume}
            accessibilityLabel={t('start_round.quick_resume')}
            testID="resume-round"
          >
            <Text style={styles.primaryButtonText}>
              {t('start_round.quick_resume')} · {activeRound.courseName ?? activeRound.courseId}
            </Text>
            <Text style={styles.muted}>
              Hole {activeRound.lastHole ?? activeRound.startHole ?? 1} of {activeRound.holes}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.muted} testID="resume-unavailable">
            {activeRoundError ?? t('start_round.no_active')}
          </Text>
        )}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleScrollToForm}
          accessibilityLabel={t('start_round.quick_new')}
          testID="start-new-round"
        >
          <Text style={styles.secondaryButtonText}>{t('start_round.quick_new')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('start_round.course_label')}</Text>
        <TextInput
          style={styles.input}
          placeholder="Search courses or enter manually"
          value={selectedCourseOption?.label ?? courseId}
          onChangeText={(value) => {
            setCourseId(value);
            setCourseManuallySet(true);
          }}
          accessibilityLabel={t('start_round.course_label')}
          testID="course-input"
        />

        <TextInput
          style={styles.input}
          placeholder="Filter nearby, recent, or all courses"
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Search courses"
          testID="course-search"
        />

        {coursesLoading ? <Text style={styles.muted}>{t('start_round.loading')}</Text> : null}
        {coursesError ? <Text style={styles.error}>{coursesError}</Text> : null}

        {nearbyCourses.length > 0 ? (
          <View style={styles.pillRow}>
            <Text style={styles.pillLabel}>Nearby</Text>
            {nearbyCourses.map((course) => renderCourseOption(course))}
          </View>
        ) : null}

        {recentCourseOptions.length > 0 ? (
          <View style={styles.pillRow}>
            <Text style={styles.pillLabel}>Recent courses</Text>
            {recentCourseOptions.map((course) => renderCourseOption(course))}
          </View>
        ) : null}

        {filteredCourses.length > 0 ? (
          <View style={styles.pillRow}>
            <Text style={styles.pillLabel}>All courses</Text>
            {filteredCourses.slice(0, 12).map((course) => renderCourseOption(course))}
          </View>
        ) : null}

        {autoCourseSuggestion.suggestedCourseId ? (
          <Text style={styles.autoCourseHint}>
            GPS suggests{' '}
            {availableCourses.find((course) => course.id === autoCourseSuggestion.suggestedCourseId)?.name ??
              autoCourseSuggestion.suggestedCourseId}
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('start_round.tee_label')}</Text>
        {teeSuggestions.length > 0 ? (
          <View style={styles.pillRow}>
            <Text style={styles.pillLabel}>Last used</Text>
            {teeSuggestions.map((tee) => (
              <TouchableOpacity
                key={tee}
                style={[styles.pillButton, teeName === tee && styles.pillButtonActive]}
                onPress={() => setTeeName(tee)}
                accessibilityLabel={tee}
                testID={`tee-chip-${tee}`}
              >
                <Text style={[styles.pillText, teeName === tee && styles.pillTextActive]}>{tee}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder={t('start_round.tee_placeholder')}
          value={teeName}
          onChangeText={setTeeName}
          accessibilityLabel={t('start_round.tee_label')}
          testID="tee-input"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('start_round.holes_label')}</Text>
        <View style={styles.toggleRow}>
          {holesOptions.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.toggle, holes === option && styles.toggleActive]}
              onPress={() => setHoles(option)}
              accessibilityLabel={`${option} holes`}
              testID={`holes-${option}`}
            >
              <Text style={[styles.toggleText, holes === option && styles.toggleTextActive]}>
                {option} {t('start_round.holes_suffix')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Tournament-safe mode</Text>
            <Text style={styles.muted}>Hide advanced caddie hints during play</Text>
          </View>
          <Switch
            value={tournamentSafe}
            onValueChange={() => updateTournamentSafe(!tournamentSafeRef.current)}
            testID="tournament-safe-toggle"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, submitting && styles.disabled]}
        disabled={submitting}
        onPress={handleStart}
        accessibilityLabel={t('start_round.button')}
        testID="start-round-button"
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>{t('start_round.button')}</Text>
        )}
        <Text style={styles.mutedSmall}>Start a new round instantly</Text>
      </TouchableOpacity>
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
    marginTop: 4,
  },
  mutedSmall: {
    color: '#9ca3af',
    marginTop: 4,
    fontSize: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#475569',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 12,
    alignItems: 'flex-start',
    gap: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontWeight: '700',
    color: '#111827',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggle: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  toggleText: {
    fontWeight: '600',
    color: '#111827',
  },
  toggleTextActive: {
    color: '#fff',
  },
  pillRow: {
    gap: 8,
  },
  pillLabel: {
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  pillButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 8,
  },
  pillButtonActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0ea5e9',
  },
  pillText: {
    fontWeight: '600',
    color: '#111827',
  },
  pillTextActive: {
    color: '#0ea5e9',
  },
  pillMeta: {
    color: '#6b7280',
    fontSize: 12,
  },
  disabled: {
    opacity: 0.7,
  },
  autoCourseHint: {
    color: '#6b7280',
    fontSize: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  switchLabel: {
    fontWeight: '700',
    color: '#0f172a',
  },
  error: {
    color: '#b91c1c',
  },
});

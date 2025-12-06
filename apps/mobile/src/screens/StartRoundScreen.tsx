import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
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
import { saveActiveRoundState } from '@app/round/roundState';
import { useGeolocation } from '@app/hooks/useGeolocation';
import { computeNearestCourse } from '@shared/round/autoHoleCore';

const holesOptions = [9, 18];

type Props = NativeStackScreenProps<RootStackParamList, 'RoundStart'>;

export default function StartRoundScreen({ navigation }: Props): JSX.Element {
  const [courseId, setCourseId] = useState('');
  const [teeName, setTeeName] = useState('');
  const [holes, setHoles] = useState<number>(18);
  const [activeRound, setActiveRound] = useState<RoundInfo | null>(null);
  const [recentRounds, setRecentRounds] = useState<RoundInfo[]>([]);
  const [availableCourses, setAvailableCourses] = useState<CourseSummary[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [courseManuallySet, setCourseManuallySet] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const geo = useGeolocation();

  useEffect(() => {
    let cancelled = false;
    async function hydrate(): Promise<void> {
      try {
        const demoCourse: CourseSummary = {
          id: 'demo-links-hero',
          name: 'Demo Links Hero',
          holeCount: 5,
        };

        const [current, history, courses] = await Promise.all([
          getCurrentRound().catch(() => null),
          listRounds(5).catch(() => []),
          fetchCourses().catch(() => null),
        ]);
        if (cancelled) return;
        setActiveRound(current ?? null);
        setRecentRounds(history ?? []);
        const hydratedCourses = courses && courses.length ? courses : [demoCourse];
        setAvailableCourses(hydratedCourses);
        const historyCourse = history?.[0];
        if (!courseId && historyCourse) {
          setCourseId(historyCourse.courseId ?? historyCourse.courseName ?? '');
        }
        if (!courseId && hydratedCourses.length) {
          setCourseId((historyCourse?.courseId ?? historyCourse?.courseName) ?? hydratedCourses[0].id);
        }
        if (!teeName && history?.[0]?.teeName) {
          setTeeName(history[0].teeName ?? '');
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
  }, []);

  const lastPlayedCourse = useMemo(() => {
    return recentRounds.find((r) => r.courseName || r.courseId) ?? null;
  }, [recentRounds]);

  const coursePickerOptions = useMemo(() => {
    const seen = new Set<string>();
    const items: { id: string; label: string }[] = [];
    availableCourses.forEach((course) => {
      if (seen.has(course.id)) return;
      seen.add(course.id);
      items.push({ id: course.id, label: course.name });
    });
    recentRounds.forEach((round) => {
      const label = round.courseName ?? round.courseId;
      if (!label || seen.has(label)) return;
      seen.add(label);
      items.push({ id: label, label });
    });
    return items;
  }, [availableCourses, recentRounds]);

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

  const autoCourseName = useMemo(
    () => availableCourses.find((course) => course.id === autoCourseSuggestion.suggestedCourseId)?.name ?? null,
    [availableCourses, autoCourseSuggestion.suggestedCourseId],
  );

  const selectedCourseOption = useMemo(
    () => coursePickerOptions.find((course) => course.id === courseId) ?? null,
    [courseId, coursePickerOptions],
  );

  const handleResume = async () => {
    if (!activeRound) return;
    const startHole = activeRound.startHole ?? 1;
    const resumeHole = Math.min(
      activeRound.lastHole ?? startHole,
      (activeRound.holes as number | undefined) ?? 18,
    );
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
    });
    navigation.navigate('RoundShot', { roundId: activeRound.id });
  };

  const handleStart = async () => {
    if (!courseId.trim()) {
      Alert.alert(t('start_round.course_label'), t('start_round.course_required'));
      return;
    }
    setSubmitting(true);
    try {
      const round = await startRound({
        courseId: courseId.trim(),
        teeName: teeName.trim() || undefined,
        holes,
        startHole: 1,
      });
      await saveActiveRoundState({ round, currentHole: round.startHole ?? 1 });
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
  };

  const handleScrollToForm = () => {
    scrollRef.current?.scrollTo({ top: 120, behavior: 'smooth' });
  };

  useEffect(() => {
    if (courseManuallySet) return;
    if (!autoCourseSuggestion.suggestedCourseId) return;
    if (autoCourseSuggestion.confidence === 'low') return;
    setCourseId(autoCourseSuggestion.suggestedCourseId);
  }, [autoCourseSuggestion.confidence, autoCourseSuggestion.suggestedCourseId, courseManuallySet]);

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
            {activeRound.lastHole ? (
              <Text style={styles.muted}>
                {t('start_round.resume_progress', {
                  hole: activeRound.lastHole,
                  total: activeRound.holes,
                })}
              </Text>
            ) : null}
          </TouchableOpacity>
        ) : (
          <Text style={styles.muted}>{t('start_round.no_active')}</Text>
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
        {lastPlayedCourse ? (
          <TouchableOpacity
            style={styles.pillButton}
            onPress={() => {
              setCourseId(lastPlayedCourse.courseId ?? lastPlayedCourse.courseName ?? '');
              setCourseManuallySet(true);
            }}
            accessibilityLabel={t('start_round.last_played')}
            testID="last-played-course"
          >
            <Text style={styles.pillText}>
              {t('start_round.last_played')} · {lastPlayedCourse.courseName ?? lastPlayedCourse.courseId}
            </Text>
          </TouchableOpacity>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder={t('start_round.course_placeholder')}
          value={selectedCourseOption?.label ?? courseId}
          onChangeText={(value) => {
            setCourseId(value);
            setCourseManuallySet(true);
          }}
          accessibilityLabel={t('start_round.course_label')}
          testID="course-input"
        />

        {coursesLoading ? (
          <Text style={styles.muted}>{t('start_round.loading')}</Text>
        ) : null}
        {coursePickerOptions.length > 0 ? (
            <View style={styles.pillRow}>
            {coursePickerOptions.map((course) => (
              <TouchableOpacity
                key={course.id}
                style={[styles.pillButton, courseId === course.id && styles.pillButtonActive]}
                onPress={() => {
                  setCourseId(course.id);
                  setCourseManuallySet(true);
                }}
                accessibilityLabel={course.label}
                testID={`course-${course.id}`}
              >
                <Text style={[styles.pillText, courseId === course.id && styles.pillTextActive]}>
                  {course.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {autoCourseSuggestion.suggestedCourseId ? (
          <Text style={styles.autoCourseHint}>
            GPS suggests {autoCourseName ?? autoCourseSuggestion.suggestedCourseId}
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('start_round.tee_label')}</Text>
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
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, submitting && styles.disabled]}
        disabled={submitting}
        onPress={handleStart}
        accessibilityLabel={t('start_round.button')}
        testID="start-round-button"
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t('start_round.button')}</Text>}
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
  title: {
    fontSize: 26,
    fontWeight: '700',
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
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
  disabled: {
    opacity: 0.7,
  },
  autoCourseHint: {
    color: '#6b7280',
    fontSize: 12,
  },
});

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { RoundRecorder } from '../../../../shared/round/recorder';
import type { RoundState } from '../../../../shared/round/types';
import { getIndex, type BundleIndexEntry } from '../../../../shared/arhud/bundle_client';

export type WizardStartPayload = {
  round: RoundState;
  meta: {
    courseId: string;
    courseName?: string | null;
    holeCount: number;
    tournamentSafe: boolean;
    startedAt: number;
  };
};

type RoundWizardProps = {
  onStart: (payload: WizardStartPayload) => void;
  onResume: (round: RoundState, courseName?: string | null) => void;
};

type CourseOption = {
  id: string;
  name: string;
};

const DEFAULT_COURSES: CourseOption[] = [
  { id: 'demo-course', name: 'Demo Course' },
];

export default function RoundWizard({ onStart, onResume }: RoundWizardProps): JSX.Element {
  const [courses, setCourses] = useState<CourseOption[]>(DEFAULT_COURSES);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [holeMode, setHoleMode] = useState<'9' | '18' | 'custom'>('18');
  const [customHoles, setCustomHoles] = useState('18');
  const [tournamentSafe, setTournamentSafe] = useState(true);
  const [checkingRound, setCheckingRound] = useState(true);
  const [resumeRound, setResumeRound] = useState<RoundState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const index = await getIndex();
        if (cancelled) {
          return;
        }
        const normalized = index.map((entry: BundleIndexEntry): CourseOption => ({
          id: entry.courseId,
          name: entry.name?.trim() || entry.courseId,
        }));
        if (normalized.length) {
          setCourses(normalized);
        }
      } catch {
        if (!cancelled) {
          setCoursesError('Unable to load courses. Showing defaults.');
        }
      } finally {
        if (!cancelled) {
          setCoursesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const round = await RoundRecorder.getActiveRound();
        if (!cancelled) {
          setResumeRound(round);
          if (round) {
            setSelectedCourseId(round.courseId);
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setCheckingRound(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCourse = useMemo(() => {
    if (!courses.length) {
      return null;
    }
    const byId = courses.find((course) => course.id === selectedCourseId);
    return byId ?? courses[0];
  }, [courses, selectedCourseId]);

  const holeCount = useMemo(() => {
    if (holeMode === '9') {
      return 9;
    }
    if (holeMode === '18') {
      return 18;
    }
    const parsed = Number.parseInt(customHoles, 10);
    return Number.isFinite(parsed) && parsed > 0 ? Math.min(54, parsed) : NaN;
  }, [customHoles, holeMode]);

  const handleStart = async () => {
    if (!selectedCourse || !Number.isFinite(holeCount)) {
      setActionError('Select course and hole count first.');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const startedAt = Date.now();
      const round = await RoundRecorder.startRound(selectedCourse.id, holeCount, startedAt, tournamentSafe);
      onStart({
        round,
        meta: {
          courseId: selectedCourse.id,
          courseName: selectedCourse.name,
          holeCount,
          tournamentSafe,
          startedAt,
        },
      });
    } catch (error) {
      setActionError((error as Error)?.message ?? 'Unable to start round.');
    } finally {
      setBusy(false);
    }
  };

  const handleResume = async () => {
    if (!resumeRound) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const round = await RoundRecorder.resumeRound();
      onResume(round, selectedCourse?.name);
    } catch (error) {
      setActionError((error as Error)?.message ?? 'Unable to resume round.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Get ready to track your round</Text>
      {checkingRound ? (
        <ActivityIndicator color="#4da3ff" />
      ) : resumeRound ? (
        <TouchableOpacity style={[styles.resumeButton, busy && styles.disabled]} onPress={handleResume} disabled={busy}>
          <Text style={styles.resumeTitle}>Resume round</Text>
          <Text style={styles.resumeMeta}>Course {resumeRound.courseId} • Hole {resumeRound.currentHole}</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Course</Text>
        {coursesLoading ? (
          <ActivityIndicator color="#4da3ff" />
        ) : (
          <View style={styles.courseList}>
            {courses.map((course) => {
              const selected = course.id === selectedCourse?.id;
              return (
                <TouchableOpacity
                  key={course.id}
                  onPress={() => setSelectedCourseId(course.id)}
                  style={[styles.courseButton, selected && styles.courseButtonSelected]}
                >
                  <Text style={[styles.courseLabel, selected && styles.courseLabelSelected]}>{course.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {coursesError ? <Text style={styles.infoText}>{coursesError}</Text> : null}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Holes</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleButton, holeMode === '9' && styles.toggleButtonActive]}
            onPress={() => setHoleMode('9')}
          >
            <Text style={[styles.toggleLabel, holeMode === '9' && styles.toggleLabelActive]}>9</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, holeMode === '18' && styles.toggleButtonActive]}
            onPress={() => setHoleMode('18')}
          >
            <Text style={[styles.toggleLabel, holeMode === '18' && styles.toggleLabelActive]}>18</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, holeMode === 'custom' && styles.toggleButtonActive]}
            onPress={() => setHoleMode('custom')}
          >
            <Text style={[styles.toggleLabel, holeMode === 'custom' && styles.toggleLabelActive]}>Custom</Text>
          </TouchableOpacity>
        </View>
        {holeMode === 'custom' ? (
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            placeholder="Enter holes"
            value={customHoles}
            onChangeText={setCustomHoles}
          />
        ) : null}
      </View>
      <View style={styles.section}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Tournament Safe mode</Text>
          <Switch value={tournamentSafe} onValueChange={setTournamentSafe} />
        </View>
        <Text style={styles.switchInfo}>Hides live coaching callouts while keeping scoring data accurate.</Text>
      </View>
      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
      <TouchableOpacity
        style={[styles.startButton, (busy || !selectedCourse || !Number.isFinite(holeCount)) && styles.disabled]}
        onPress={handleStart}
        disabled={busy || !selectedCourse || !Number.isFinite(holeCount)}
      >
        {busy ? <ActivityIndicator color="#0a0f1d" /> : <Text style={styles.startLabel}>Start round</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 24,
    flexGrow: 1,
    backgroundColor: '#0a0f1d',
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  section: {
    backgroundColor: '#141c2f',
    padding: 16,
    borderRadius: 18,
    gap: 16,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  courseList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  courseButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#1f2a43',
  },
  courseButtonSelected: {
    backgroundColor: '#4da3ff',
  },
  courseLabel: {
    color: '#8ea0c9',
    fontWeight: '600',
  },
  courseLabelSelected: {
    color: '#0a0f1d',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#1f2a43',
  },
  toggleButtonActive: {
    backgroundColor: '#4da3ff',
  },
  toggleLabel: {
    color: '#8ea0c9',
    fontWeight: '600',
  },
  toggleLabelActive: {
    color: '#0a0f1d',
  },
  input: {
    backgroundColor: '#1f2a43',
    color: '#ffffff',
    borderRadius: 12,
    padding: 12,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchInfo: {
    color: '#8ea0c9',
    fontSize: 14,
  },
  infoText: {
    color: '#8ea0c9',
  },
  errorText: {
    color: '#ff6b8a',
    fontWeight: '600',
  },
  resumeButton: {
    backgroundColor: '#4da3ff',
    padding: 16,
    borderRadius: 16,
  },
  resumeTitle: {
    color: '#0a0f1d',
    fontSize: 18,
    fontWeight: '700',
  },
  resumeMeta: {
    color: '#0a0f1d',
    marginTop: 4,
  },
  startButton: {
    backgroundColor: '#4da3ff',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  startLabel: {
    color: '#0a0f1d',
    fontWeight: '700',
    fontSize: 16,
  },
  disabled: {
    opacity: 0.6,
  },
});

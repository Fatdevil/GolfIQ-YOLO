import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchHeroCourses, type CourseHero } from '@app/api/courses';
import type { RootStackParamList } from '@app/navigation/types';
import { getItem, setItem } from '@app/storage/asyncStorage';

const RECENT_KEY = 'golfiq.recentCourses.v1';
const MAX_RECENTS = 5;

type Props = NativeStackScreenProps<RootStackParamList, 'PlayCourseSelect'>;

type RecentCourse = Pick<CourseHero, 'id' | 'name' | 'country'>;

async function loadRecentCourses(): Promise<RecentCourse[]> {
  const raw = await getItem(RECENT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RecentCourse[];
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // ignore invalid history
  }
  return [];
}

async function saveRecentCourse(course: RecentCourse): Promise<void> {
  const current = await loadRecentCourses();
  const filtered = current.filter((item) => item.id !== course.id);
  const next = [course, ...filtered].slice(0, MAX_RECENTS);
  await setItem(RECENT_KEY, JSON.stringify(next));
}

export default function CourseSelectScreen({ navigation }: Props): JSX.Element {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    courses: CourseHero[];
  }>({ loading: true, error: null, courses: [] });
  const [recents, setRecents] = useState<RecentCourse[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [courses, storedRecents] = await Promise.all([fetchHeroCourses(), loadRecentCourses()]);
      setState({ loading: false, error: null, courses });
      setRecents(storedRecents);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load courses';
      setState({ loading: false, error: message, courses: [] });
    }
  }, []);

  useEffect(() => {
    load().catch(() => {
      /* handled */
    });
  }, [load]);

  const filteredCourses = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return state.courses;
    return state.courses.filter((course) => {
      return (
        course.name.toLowerCase().includes(term) ||
        (course.country ? course.country.toLowerCase().includes(term) : false)
      );
    });
  }, [query, state.courses]);

  const handleSelect = useCallback(
    async (course: CourseHero | RecentCourse) => {
      await saveRecentCourse({ id: course.id, name: course.name, country: course.country });
      navigation.navigate('PlayTeeSelect', {
        courseId: course.id,
        courseName: course.name,
        tees: 'tees' in course ? course.tees : undefined,
      });
    },
    [navigation],
  );

  if (state.loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Loading courses…</Text>
      </View>
    );
  }

  if (state.error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText} testID="courses-error">{state.error}</Text>
        <TouchableOpacity onPress={() => load().catch(() => {})} testID="courses-retry">
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Choose a course</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search course or country"
        style={styles.input}
        testID="course-search"
      />

      {recents.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent</Text>
          {recents.map((course) => (
            <TouchableOpacity key={course.id} onPress={() => handleSelect(course)} testID={`recent-${course.id}`}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{course.name}</Text>
                {course.country && <Text style={styles.cardSubtitle}>{course.country}</Text>}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hero courses</Text>
        {filteredCourses.map((course) => (
          <TouchableOpacity key={course.id} onPress={() => handleSelect(course)} testID={`course-${course.id}`}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{course.name}</Text>
              {course.country && <Text style={styles.cardSubtitle}>{course.country}</Text>}
              <Text style={styles.meta}>
                {course.tees.length > 0
                  ? `${course.tees.length} tee${course.tees.length > 1 ? 's' : ''}`
                  : 'No tees listed'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
        {filteredCourses.length === 0 && (
          <Text style={styles.empty} testID="course-empty">
            No courses match your search.
          </Text>
        )}
      </View>
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
  input: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
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
    gap: 4,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  cardSubtitle: {
    color: '#6b7280',
    fontSize: 13,
  },
  meta: {
    color: '#111827',
    fontSize: 12,
  },
  empty: {
    color: '#6b7280',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  primaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#111827',
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '700',
    textAlign: 'center',
  },
});

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchAllDrills, fetchPracticePlan, type Drill, type DrillCategory } from '@app/api/practiceClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';

const DURATIONS = [30, 45, 60, 90];

function formatCategory(category: DrillCategory): string {
  switch (category) {
    case 'driving':
      return t('practice_planner_driving');
    case 'approach':
      return t('practice_planner_approach');
    case 'short_game':
      return t('practice_planner_short_game');
    case 'putting':
      return t('practice_planner_putting');
    case 'mixed':
    default:
      return t('practice_planner_mixed');
  }
}

type Props = NativeStackScreenProps<RootStackParamList, 'PracticePlanner'>;

export default function PracticePlannerScreen({ navigation }: Props): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof fetchPracticePlan>> | null>(null);
  const [allDrills, setAllDrills] = useState<Drill[] | null>(null);
  const [selectedMinutes, setSelectedMinutes] = useState(60);
  const [showLibrary, setShowLibrary] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const loadPlan = (minutes: number) => {
    setLoading(true);
    fetchPracticePlan({ maxMinutes: minutes })
      .then((data) => {
        setPlan(data);
        setPlanError(null);
      })
      .catch(() => setPlanError(t('practice_planner_error')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPlan(selectedMinutes);
  }, [selectedMinutes]);

  useEffect(() => {
    fetchAllDrills()
      .then((data) => setAllDrills(data))
      .catch(() => setAllDrills([]));
  }, []);

  const focusChips = useMemo(() => plan?.focusCategories ?? [], [plan?.focusCategories]);
  const browseList = useMemo(() => allDrills ?? [], [allDrills]);

  const toggleComplete = (id: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container} testID="practice-planner-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{t('practice_planner_title')}</Text>
        <Text style={styles.subtitle}>{t('practice_planner_subtitle')}</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('MyBag')}
          testID="planner-my-bag-link"
        >
          <Text style={styles.link}>{t('my_bag_entry_planner')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('practice_planner_time_title')}</Text>
        <View style={styles.row}>
          {DURATIONS.map((minutes) => {
            const active = selectedMinutes === minutes;
            return (
              <TouchableOpacity
                key={minutes}
                onPress={() => setSelectedMinutes(minutes)}
                testID={`duration-${minutes}`}
              >
                <View style={[styles.pill, active && styles.pillActive]}>
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {t('practice_planner_time_option', { minutes })}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('practice_planner_focus_title')}</Text>
        <View style={styles.rowWrap}>
          {focusChips.length === 0 && !loading ? (
            <Text style={styles.muted}>{t('practice_planner_no_data')}</Text>
          ) : (
            focusChips.map((cat) => (
              <View style={styles.chip} key={cat} testID={`focus-${cat}`}>
                <Text style={styles.chipText}>{formatCategory(cat)}</Text>
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('practice_planner_plan_title')}</Text>
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.muted}>{t('practice_planner_loading')}</Text>
          </View>
        )}
        {planError && <Text style={styles.error}>{planError}</Text>}
        {!loading && plan?.drills?.length === 0 && (
          <Text style={styles.muted}>{t('practice_planner_no_data')}</Text>
        )}
        {plan?.drills?.map((drill) => {
          const done = completed.has(drill.id);
          return (
            <TouchableOpacity
              key={drill.id}
              onPress={() => toggleComplete(drill.id)}
              testID={`plan-drill-${drill.id}`}
            >
              <View style={[styles.card, done && styles.cardDone]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{drill.name}</Text>
                  <Text style={styles.difficulty}>{drill.difficulty.toUpperCase()}</Text>
                </View>
                <Text style={styles.muted}>{formatCategory(drill.category)}</Text>
                <Text style={styles.cardSubtitle} numberOfLines={2}>
                  {drill.description}
                </Text>
                <Text style={styles.detail}>{t('practice_planner_duration', { minutes: drill.durationMinutes })}</Text>
                {done && <Text style={styles.doneLabel}>{t('practice_planner_done')}</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.section}>
        <TouchableOpacity onPress={() => setShowLibrary((prev) => !prev)} testID="toggle-library">
          <View style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{t('practice_planner_browse_all')}</Text>
          </View>
        </TouchableOpacity>
        {showLibrary && (
          <View style={{ marginTop: 8 }}>
            {browseList.map((drill) => (
              <View style={styles.libraryItem} key={`lib-${drill.id}`} testID={`library-${drill.id}`}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{drill.name}</Text>
                  <Text style={styles.muted}>{formatCategory(drill.category)}</Text>
                </View>
                <Text style={styles.cardSubtitle} numberOfLines={2}>
                  {drill.description}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <TouchableOpacity onPress={() => navigation.navigate('WeeklySummary')}>
        <Text style={[styles.link, { marginBottom: 24 }]}>{t('practice_planner_weekly_cta')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  header: { gap: 4 },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: { color: '#666' },
  section: { marginTop: 8 },
  sectionTitle: { fontWeight: '700', fontSize: 16, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: {
    backgroundColor: '#eef2ff',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { color: '#1e3a8a', fontWeight: '600' },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  pillActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  pillText: { color: '#333' },
  pillTextActive: { color: '#fff', fontWeight: '700' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  muted: { color: '#666' },
  error: { color: '#c00' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardDone: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  cardTitle: { fontWeight: '700', fontSize: 15 },
  cardSubtitle: { color: '#444', marginTop: 4 },
  detail: { marginTop: 4, color: '#333' },
  difficulty: { fontWeight: '700', color: '#0f172a' },
  doneLabel: { color: '#16a34a', fontWeight: '700', marginTop: 4 },
  secondaryButton: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#1e3a8a', fontWeight: '700' },
  libraryItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  link: { color: '#0ea5e9', textAlign: 'center', fontWeight: '700' },
});

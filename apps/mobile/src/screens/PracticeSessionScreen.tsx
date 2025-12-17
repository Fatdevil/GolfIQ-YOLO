import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { findDrillById } from '@app/practice/drillsCatalog';
import {
  getWeekStartISO,
  loadCurrentWeekPracticePlan,
  loadPracticePlan,
  savePracticePlan,
  serializePracticePlanWrite,
  type PracticePlan,
  type PracticePlanItem,
} from '@app/practice/practicePlanStorage';
import { savePracticeSession, type PracticeSession } from '@app/practice/practiceSessionStorage';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c0c0f' },
  content: { padding: 16, gap: 12 },
  card: { backgroundColor: '#16171f', borderRadius: 12, padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#f5f5f7' },
  subtitle: { color: '#b6b6c2' },
  muted: { color: '#8a8a94' },
  primaryButton: {
    backgroundColor: '#00c853',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#0c0c0f', fontWeight: '700' },
  secondaryButton: {
    backgroundColor: '#1f202a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#f5f5f7', fontWeight: '700' },
  inlineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progress: { color: '#f5f5f7', fontWeight: '700' },
  drillTitle: { color: '#f5f5f7', fontSize: 18, fontWeight: '700' },
  drillBody: { color: '#f5f5f7' },
  actionRow: { flexDirection: 'row', gap: 12 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#1f202a',
    alignSelf: 'flex-start',
  },
  recapStat: { color: '#f5f5f7', fontSize: 18, fontWeight: '700' },
  recapLabel: { color: '#b6b6c2' },
});

type Props = NativeStackScreenProps<RootStackParamList, 'PracticeSession'>;

type SessionProgress = {
  completed: string[];
  skipped: string[];
};

export default function PracticeSessionScreen({ navigation }: Props): JSX.Element {
  const weekStartISO = useMemo(() => getWeekStartISO(), []);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PracticePlan | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showRecap, setShowRecap] = useState(false);
  const [endedAt, setEndedAt] = useState<string | undefined>();
  const [progress, setProgress] = useState<SessionProgress>({ completed: [], skipped: [] });
  const [sessionId] = useState(() => `practice-${Date.now()}`);
  const [startedAt] = useState(() => new Date().toISOString());

  const drills: PracticePlanItem[] = useMemo(() => plan?.items ?? [], [plan]);
  const total = drills.length;
  const current = drills[currentIndex];
  const currentDrill = current ? findDrillById(current.drillId) : undefined;

  useEffect(() => {
    loadCurrentWeekPracticePlan()
      .then((stored) => setPlan(stored))
      .finally(() => setLoading(false));
  }, []);

  const finalizeSession = async (
    completedDrills = progress.completed,
    skippedDrills = progress.skipped,
  ) => {
    if (showRecap) return;
    const session: PracticeSession = {
      id: sessionId,
      weekStartISO,
      startedAt,
      endedAt: new Date().toISOString(),
      drillIds: drills.map((item) => item.drillId),
      completedDrillIds: Array.from(new Set(completedDrills)),
      skippedDrillIds: Array.from(new Set(skippedDrills)),
    };
    setEndedAt(session.endedAt);
    setShowRecap(true);
    await savePracticeSession(session);
  };

  const updatePlanItemStatus = async (itemId: string, status: PracticePlanItem['status']) => {
    await serializePracticePlanWrite(async () => {
      const latestPlan = await loadPracticePlan();
      const currentPlan = latestPlan?.weekStartISO === weekStartISO ? latestPlan : plan;
      if (!currentPlan) return null;

      const nextItems = currentPlan.items.map((item) =>
        item.id === itemId ? { ...item, status } : item,
      );
      const nextPlan: PracticePlan = { ...currentPlan, items: nextItems };
      setPlan(nextPlan);
      await savePracticePlan(nextPlan);
      return nextPlan;
    });
  };

  const advance = async (nextIndex: number, nextProgress: SessionProgress) => {
    setProgress(nextProgress);
    if (nextIndex >= total) {
      await finalizeSession(nextProgress.completed, nextProgress.skipped);
      return;
    }
    setCurrentIndex(nextIndex);
  };

  const handleComplete = async () => {
    if (!current) return;
    await updatePlanItemStatus(current.id, 'done');
    const completed = progress.completed.includes(current.drillId)
      ? progress.completed
      : [...progress.completed, current.drillId];
    await advance(currentIndex + 1, { ...progress, completed });
  };

  const handleSkip = async () => {
    if (!current) return;
    const skipped = progress.skipped.includes(current.drillId)
      ? progress.skipped
      : [...progress.skipped, current.drillId];
    await advance(currentIndex + 1, { ...progress, skipped });
  };

  const handleEndSession = () => {
    Alert.alert(t('practice.session.end'), t('practice.session.endConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('practice.session.end'),
        style: 'destructive',
        onPress: () => finalizeSession(),
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator />
        <Text style={styles.subtitle}>{t('practicePlan.loading')}</Text>
      </View>
    );
  }

  if (!plan || drills.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={{ ...styles.content, flex: 1, justifyContent: 'center' }}
        testID="practice-session-empty"
      >
        <Text style={styles.title}>{t('practice.session.empty.title')}</Text>
        <Text style={styles.subtitle}>{t('practice.session.empty.body')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('WeeklySummary')} testID="session-empty-weekly">
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{t('practice.session.empty.cta')}</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (showRecap) {
    const durationMinutes = endedAt
      ? Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000))
      : null;
    return (
      <ScrollView contentContainerStyle={styles.content} testID="practice-session-recap">
        <Text style={styles.title}>{t('practice.recap.title')}</Text>
        <Text style={styles.subtitle}>{t('practice.recap.subtitle')}</Text>
        <View style={styles.card}>
          <View style={styles.inlineRow}>
            <Text style={styles.recapStat}>{progress.completed.length}</Text>
            <Text style={styles.recapLabel}>{t('practice.recap.completed')}</Text>
          </View>
          <View style={styles.inlineRow}>
            <Text style={styles.recapStat}>{progress.skipped.length}</Text>
            <Text style={styles.recapLabel}>{t('practice.recap.skipped')}</Text>
          </View>
          <View style={styles.inlineRow}>
            <Text style={styles.recapStat}>{total}</Text>
            <Text style={styles.recapLabel}>{t('practice.recap.total')}</Text>
          </View>
          {durationMinutes ? (
            <View style={styles.inlineRow}>
              <Text style={styles.recapStat}>{durationMinutes} min</Text>
              <Text style={styles.recapLabel}>{t('practice.recap.duration')}</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('WeeklySummary')}
          testID="recap-weekly"
        >
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{t('practice.recap.ctaBack')}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('PracticePlanner')}
          testID="recap-plan"
        >
          <View style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{t('practice.recap.ctaViewPlan')}</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} testID="practice-session">
      <View style={styles.inlineRow}>
        <Text style={styles.title}>{t('practice.session.title')}</Text>
        <View style={styles.chip}>
          <Text style={styles.progress}>{t('practice.session.progress', { current: currentIndex + 1, total })}</Text>
        </View>
      </View>
      {current ? (
        <View style={styles.card} testID={`session-drill-${current.id}`}>
          <Text style={styles.drillTitle}>{currentDrill ? t(currentDrill.titleKey) : t('practicePlan.unknownDrill')}</Text>
          <Text style={styles.drillBody} numberOfLines={3}>
            {currentDrill ? t(currentDrill.descriptionKey) : t('practicePlan.unknownDrill')}
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.drillTitle}>{t('practice.session.empty.title')}</Text>
        </View>
      )}
      <View style={styles.actionRow}>
        <TouchableOpacity onPress={handleComplete} disabled={!current} testID="session-done">
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{t('practice.session.done')}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSkip} disabled={!current} testID="session-skip">
          <View style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{t('practice.session.skip')}</Text>
          </View>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={handleEndSession} testID="session-end">
        <Text style={styles.muted}>{t('practice.session.end')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

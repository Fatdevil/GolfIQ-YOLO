import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { DRILLS_CATALOG, findDrillById } from '@app/practice/drillsCatalog';
import {
  getWeekStartISO,
  loadCurrentWeekPracticePlan,
  loadPracticePlan,
  savePracticePlan,
  serializePracticePlanWrite,
  type PracticePlan,
  type PracticePlanItem,
} from '@app/practice/practicePlanStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'PracticePlanner'>;

type PlannedDrill = { item: PracticePlanItem; drill: ReturnType<typeof findDrillById> };

export default function PracticePlannerScreen({ navigation }: Props): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PracticePlan | null>(null);

  const loadPlan = () => {
    setLoading(true);
    loadCurrentWeekPracticePlan()
      .then((stored) => {
        setPlan(stored);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPlan();
  }, []);

  const mappedItems: PlannedDrill[] = (plan?.items ?? []).map((item) => ({
    item,
    drill: findDrillById(item.drillId),
  }));

  const toggleStatus = async (itemId: string) => {
    await serializePracticePlanWrite(async () => {
      const latestPlan = await loadPracticePlan();
      const currentPlan: PracticePlan | null =
        latestPlan?.weekStartISO === getWeekStartISO() ? latestPlan : plan ?? null;
      if (!currentPlan) return null;

      const nextItems: PracticePlanItem[] = currentPlan.items.map((item) =>
        item.id === itemId ? { ...item, status: item.status === 'done' ? 'planned' : 'done' } : item,
      );
      const nextPlan: PracticePlan = { ...currentPlan, items: nextItems };
      setPlan(nextPlan);
      await savePracticePlan(nextPlan);
      return nextPlan;
    });
  };

  const removeItem = async (itemId: string) => {
    await serializePracticePlanWrite(async () => {
      const latestPlan = await loadPracticePlan();
      const currentPlan: PracticePlan | null =
        latestPlan?.weekStartISO === getWeekStartISO() ? latestPlan : plan ?? null;
      if (!currentPlan) return null;

      const nextPlan: PracticePlan = { ...currentPlan, items: currentPlan.items.filter((item) => item.id !== itemId) };
      setPlan(nextPlan);
      await savePracticePlan(nextPlan);
      return nextPlan;
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container} testID="practice-planner-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{t('practicePlan.title')}</Text>
        <Text style={styles.subtitle}>{t('practicePlan.thisWeek')}</Text>
      </View>

      <TouchableOpacity
        onPress={() => navigation.navigate('PracticeJournal')}
        testID="practice-planner-history"
      >
        <Text style={styles.link}>{t('practice.journal.view_history')}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('PracticeSession')} testID="planner-start-session">
        <View style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{t('practice.session.start')}</Text>
        </View>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>{t('practicePlan.loading')}</Text>
        </View>
      ) : mappedItems.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('practicePlan.emptyTitle')}</Text>
          <Text style={styles.muted}>{t('practicePlan.emptyBody')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('WeeklySummary')} testID="planner-go-weekly">
            <Text style={styles.link}>{t('practicePlan.fromWeekly')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        mappedItems.map(({ item, drill }) => {
          const statusKey = item.status === 'done' ? 'practicePlan.statusDone' : 'practicePlan.statusPlanned';
          return (
            <View style={styles.card} key={item.id} testID={`plan-item-${item.id}`}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{drill ? t(drill.titleKey) : t('practicePlan.unknownDrill')}</Text>
                  <Text style={styles.cardSubtitle} numberOfLines={2}>
                    {drill ? t(drill.descriptionKey) : t('practicePlan.unknownDrill')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusChip,
                    item.status === 'done' ? styles.statusDone : styles.statusPlanned,
                  ]}
                >
                  <Text style={styles.statusText}>{t(statusKey)}</Text>
                </View>
              </View>
              <Text style={styles.detail}>
                {t('practicePlan.duration', { minutes: drill?.durationMin ?? 10 })}
              </Text>
              <View style={styles.actionRow}>
                <TouchableOpacity onPress={() => toggleStatus(item.id)} testID={`toggle-item-${item.id}`}>
                  <View style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>
                      {t(item.status === 'done' ? 'practicePlan.markPlanned' : 'practicePlan.markDone')}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeItem(item.id)} testID={`remove-item-${item.id}`}>
                  <View style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>{t('practicePlan.remove')}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      <View style={styles.library}>
        <Text style={styles.sectionTitle}>{t('practicePlan.catalogTitle')}</Text>
        {DRILLS_CATALOG.map((drill) => (
          <View style={styles.libraryItem} key={drill.id} testID={`library-${drill.id}`}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{t(drill.titleKey)}</Text>
              <Text style={styles.muted}>{t('practicePlan.duration', { minutes: drill.durationMin })}</Text>
            </View>
            <Text style={styles.cardSubtitle}>{t(drill.descriptionKey)}</Text>
          </View>
        ))}
      </View>
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
  center: { alignItems: 'center', gap: 8 },
  muted: { color: '#666' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
    gap: 8,
  },
  cardTitle: { fontWeight: '700', fontSize: 16 },
  cardSubtitle: { color: '#444' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusText: { fontWeight: '700', color: '#0f172a' },
  statusDone: { backgroundColor: '#dcfce7' },
  statusPlanned: { backgroundColor: '#e0f2fe' },
  detail: { color: '#333' },
  actionRow: { flexDirection: 'row', gap: 10 },
  primaryButton: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  secondaryButtonText: { color: '#1e3a8a', fontWeight: '700' },
  link: { color: '#0ea5e9', fontWeight: '700', marginTop: 8 },
  sectionTitle: { fontWeight: '700', fontSize: 16 },
  library: { marginTop: 8, gap: 8 },
  libraryItem: { borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 8 },
});

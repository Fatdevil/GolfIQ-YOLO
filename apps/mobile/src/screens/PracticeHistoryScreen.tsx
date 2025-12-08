import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchPlayerBag } from '@app/api/bagClient';
import { fetchBagStats } from '@app/api/bagStatsClient';
import type { RootStackParamList } from '@app/navigation/types';
import { t } from '@app/i18n';
import { buildBagReadinessOverview } from '@shared/caddie/bagReadiness';
import { buildBagPracticeRecommendation, type BagPracticeRecommendation } from '@shared/caddie/bagPracticeRecommendations';
import type { BagClubStatsMap } from '@shared/caddie/bagStats';
import { PRACTICE_MISSION_WINDOW_DAYS, loadPracticeMissionHistory } from '@app/storage/practiceMissionHistory';
import { buildPracticeHistoryList, type PracticeHistoryListItem } from '@shared/practice/practiceHistory';

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatusPill({ status }: { status: PracticeHistoryListItem['status'] }): JSX.Element {
  const labelKey =
    status === 'completed'
      ? 'practice.history.status.completed'
      : status === 'partial'
        ? 'practice.history.status.partial'
        : 'practice.history.status.incomplete';
  return (
    <View
      style={[
        styles.status,
        status === 'completed'
          ? styles.statusSuccess
          : status === 'partial'
            ? styles.statusWarning
            : styles.statusMuted,
      ]}
    >
      <Text style={styles.statusText}>{t(labelKey)}</Text>
    </View>
  );
}

function HistoryItem({ item, onPress }: { item: PracticeHistoryListItem; onPress?: () => void }): JSX.Element {
  const dateLabel = useMemo(() => formatDate(item.day), [item.day]);
  const sampleLabel = item.targetSampleCount
    ? t('practice.history.samplesWithTarget', {
        completed: item.completedSampleCount,
        target: item.targetSampleCount,
      })
    : t('practice.history.samples', { completed: item.completedSampleCount });

  return (
    <TouchableOpacity onPress={onPress} testID="practice-history-item">
      <View style={styles.item}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemDate}>{dateLabel}</Text>
          <StatusPill status={item.status} />
        </View>
        <Text style={styles.itemClubs}>{item.targetClubsLabel || t('practice.history.anyClub')}</Text>
        <Text style={styles.itemSamples}>{sampleLabel}</Text>
        {item.countsTowardStreak ? <Text style={styles.streak}>{t('practice.history.streakTag')}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

type Props = NativeStackScreenProps<RootStackParamList, 'PracticeHistory'>;

type PracticeHistoryState = {
  loading: boolean;
  items: PracticeHistoryListItem[];
  recommendation: BagPracticeRecommendation | null;
};

export default function PracticeHistoryScreen({ navigation }: Props): JSX.Element {
  const [state, setState] = useState<PracticeHistoryState>({ loading: true, items: [], recommendation: null });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [history, bag, bagStats] = await Promise.all<[
          Awaited<ReturnType<typeof loadPracticeMissionHistory>>,
          Awaited<ReturnType<typeof fetchPlayerBag>> | null,
          BagClubStatsMap,
        ]>([
          loadPracticeMissionHistory(),
          fetchPlayerBag().catch(() => null),
          fetchBagStats().catch(() => ({} as BagClubStatsMap)),
        ]);

        if (cancelled) return;

        const clubLabels = bag?.clubs.reduce<Record<string, string>>((acc, club) => {
          acc[club.clubId] = club.label;
          return acc;
        }, {}) ?? {};

        const items = buildPracticeHistoryList(history, {
          daysBack: PRACTICE_MISSION_WINDOW_DAYS,
          limit: 20,
          clubLabels,
        });

        let recommendation: BagPracticeRecommendation | null = null;
        if (bag) {
          const overview = buildBagReadinessOverview(bag, bagStats ?? {});
          recommendation = buildBagPracticeRecommendation(overview, overview.suggestions, history);
        }

        setState({ loading: false, items, recommendation });
      } catch (err) {
        if (!cancelled) {
          console.warn('[practice] Failed to load history', err);
          setState({ loading: false, items: [], recommendation: null });
        }
      }
    };

    load().catch((err) => console.warn('[practice] history load crashed', err));

    return () => {
      cancelled = true;
    };
  }, []);

  const { items, loading, recommendation } = state;

  const handleStartRecommended = () => {
    navigation.navigate('RangeQuickPracticeStart', recommendation ? { practiceRecommendation: recommendation } : undefined);
  };

  const handleSelectHistoryItem = (entryId: string) => {
    navigation.navigate('PracticeMissionDetail', { entryId });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
        <Text style={styles.loading}>{t('practice.history.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('practice.history.title')}</Text>
      {items.length === 0 ? (
        <View style={styles.empty} testID="practice-history-empty">
          <Text style={styles.emptyTitle}>{t('practice.history.emptyTitle')}</Text>
          <Text style={styles.emptySubtitle}>{t('practice.history.emptyBody')}</Text>
          <TouchableOpacity onPress={handleStartRecommended} testID="practice-history-start">
            <View style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('practice.history.startCta')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <HistoryItem item={item} onPress={() => handleSelectHistoryItem(item.id)} />
          )}
          testID="practice-history-list"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  loading: {
    color: '#4B5563',
    marginTop: 8,
  },
  empty: {
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  emptySubtitle: {
    color: '#4B5563',
  },
  list: {
    gap: 12,
    paddingTop: 8,
  },
  item: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    gap: 6,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemDate: {
    fontWeight: '700',
    color: '#111827',
  },
  itemClubs: {
    color: '#111827',
    fontWeight: '600',
  },
  itemSamples: {
    color: '#374151',
  },
  streak: {
    color: '#2563EB',
    fontWeight: '700',
  },
  status: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontWeight: '700',
    color: '#0f172a',
    fontSize: 12,
  },
  statusSuccess: {
    backgroundColor: '#DCFCE7',
  },
  statusWarning: {
    backgroundColor: '#FEF3C7',
  },
  statusMuted: {
    backgroundColor: '#E5E7EB',
  },
  primaryButton: {
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});

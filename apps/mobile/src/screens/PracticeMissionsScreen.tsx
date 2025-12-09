import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchPlayerBag } from '@app/api/bagClient';
import { fetchBagStats } from '@app/api/bagStatsClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { PRACTICE_MISSION_WINDOW_DAYS, loadPracticeMissionHistory } from '@app/storage/practiceMissionHistory';
import { buildBagReadinessOverview, type BagReadinessOverview } from '@shared/caddie/bagReadiness';
import type { BagSuggestion } from '@shared/caddie/bagTuningSuggestions';
import { buildMissionProgressById, type PracticeMissionHistoryEntry } from '@shared/practice/practiceHistory';
import {
  buildPracticeMissionsList,
  type PracticeMissionDefinition,
  type PracticeMissionListItem,
} from '@shared/practice/practiceMissionsList';
import { safeEmit } from '@app/telemetry';

type Props = NativeStackScreenProps<RootStackParamList, 'PracticeMissions'>;

type ScreenState = {
  loading: boolean;
  missions: PracticeMissionListItem[];
  history: PracticeMissionHistoryEntry[];
};

function formatDate(value: number | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function mapSuggestionToMissionDefinition(suggestion: BagSuggestion): PracticeMissionDefinition | null {
  if (suggestion.type === 'fill_gap' && suggestion.lowerClubId && suggestion.upperClubId) {
    return {
      id: `practice_fill_gap:${suggestion.lowerClubId}:${suggestion.upperClubId}`,
      titleKey: 'bag.practice.fill_gap.title',
      descriptionKey: 'bag.practice.fill_gap.description',
    };
  }

  if (suggestion.type === 'reduce_overlap' && suggestion.lowerClubId && suggestion.upperClubId) {
    return {
      id: `practice_reduce_overlap:${suggestion.lowerClubId}:${suggestion.upperClubId}`,
      titleKey: 'bag.practice.reduce_overlap.title',
      descriptionKey: 'bag.practice.reduce_overlap.description',
    };
  }

  if (suggestion.type === 'calibrate' && suggestion.clubId) {
    return {
      id: `practice_calibrate:${suggestion.clubId}`,
      titleKey: 'bag.practice.calibrate.title',
      descriptionKey: 'bag.practice.calibrate.more_samples.description',
    };
  }

  return null;
}

function buildMissionDefinitions(
  bagReadiness: BagReadinessOverview | null,
  history: PracticeMissionHistoryEntry[],
): PracticeMissionDefinition[] {
  const map = new Map<string, PracticeMissionDefinition>();

  bagReadiness?.suggestions?.forEach((suggestion) => {
    const def = mapSuggestionToMissionDefinition(suggestion);
    if (def) map.set(def.id, def);
  });

  history.forEach((entry) => {
    if (!map.has(entry.missionId)) {
      map.set(entry.missionId, { id: entry.missionId, title: entry.missionId });
    }
  });

  return Array.from(map.values());
}

function MissionRow({ item, onPress }: { item: PracticeMissionListItem; onPress: () => void }): JSX.Element {
  const lastCompletedLabel = useMemo(() => formatDate(item.lastCompletedAt), [item.lastCompletedAt]);

  return (
    <TouchableOpacity onPress={onPress} testID={`practice-mission-item-${item.id}`}>
      <View style={styles.item}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{t(item.subtitleKey)}</Text>
          </View>
        </View>
        {lastCompletedLabel ? (
          <Text style={styles.meta}>{`${t('practice.history.detail.endedAt')}: ${lastCompletedLabel}`}</Text>
        ) : (
          <Text style={styles.meta}>{t('practice.history.detail.unknown')}</Text>
        )}
        {item.inStreak ? <Text style={styles.streak}>{t('practice.history.streakTag')}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export default function PracticeMissionsScreen({ navigation, route }: Props): JSX.Element {
  const [state, setState] = useState<ScreenState>({ loading: true, missions: [], history: [] });
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    safeEmit('practice_missions_viewed', { surface: 'mobile', source: route.params?.source ?? 'other' });
  }, [route.params?.source]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const historyPromise = loadPracticeMissionHistory();
        const bagPromise = fetchPlayerBag().catch(
          () => null as Awaited<ReturnType<typeof fetchPlayerBag>> | null,
        );
        const bagStatsPromise = fetchBagStats().catch(
          () => null as Awaited<ReturnType<typeof fetchBagStats>> | null,
        );

        const [history, bag, bagStats] = await Promise.all([
          historyPromise,
          bagPromise,
          bagStatsPromise,
        ] as const);

        if (cancelled) return;

        const bagReadiness = bag ? buildBagReadinessOverview(bag, bagStats ?? {}) : null;
        const missions = buildMissionDefinitions(bagReadiness, history);
        const missionProgressById = buildMissionProgressById(
          history,
          missions.map((mission) => mission.id),
          { windowDays: PRACTICE_MISSION_WINDOW_DAYS },
        );

        const prioritizedMissions = buildPracticeMissionsList({
          bagReadiness,
          missionProgressById,
          missions,
        });

        setState({ loading: false, missions: prioritizedMissions, history });
      } catch (err) {
        if (!cancelled) {
          console.warn('[practice] Failed to load missions screen', err);
          setState({ loading: false, missions: [], history: [] });
        }
      }
    };

    load().catch((err) => console.warn('[practice] missions screen crashed', err));

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectMission = (missionId: string) => {
    safeEmit('practice_mission_start', { missionId, sourceSurface: 'missions_list' });

    const latestEntry = [...state.history]
      .filter((entry) => entry.missionId === missionId)
      .sort((a, b) => new Date(b.endedAt ?? b.startedAt).getTime() - new Date(a.endedAt ?? a.startedAt).getTime())[0];

    if (latestEntry) {
      navigation.navigate('PracticeMissionDetail', { entryId: latestEntry.id });
      return;
    }

    navigation.navigate('RangeQuickPracticeStart', { missionId, entrySource: 'missions' });
  };

  if (state.loading) {
    return (
      <View style={styles.container} testID="practice-missions-loading">
        <ActivityIndicator />
        <Text style={styles.loading}>{t('practice.history.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('practice.missions.title')}</Text>
      {state.missions.length === 0 ? (
        <View style={styles.empty} testID="practice-missions-empty">
          <Text style={styles.emptyTitle}>{t('practice.missions.empty.title')}</Text>
          <Text style={styles.emptySubtitle}>{t('practice.missions.empty.body')}</Text>
        </View>
      ) : (
        <FlatList
          data={state.missions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <MissionRow item={item} onPress={() => handleSelectMission(item.id)} />
          )}
          testID="practice-missions-list"
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
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemTitle: {
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  statusPill: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontWeight: '700',
    color: '#312E81',
    fontSize: 12,
  },
  meta: {
    color: '#374151',
  },
  streak: {
    color: '#2563EB',
    fontWeight: '700',
  },
});

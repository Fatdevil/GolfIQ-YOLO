import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { t } from '@app/i18n';
import { buildRangeSessionStory } from '@app/range/rangeSessionStory';
import type { RangeHistoryEntry } from '@app/range/rangeHistoryStorage';
import { loadRangeHistory } from '@app/range/rangeHistoryStorage';
import type { RootStackParamList } from '@app/navigation/types';
import { getMissionById } from '@app/range/rangeMissions';

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function FocusLabel({ entry }: { entry: RangeHistoryEntry }): JSX.Element {
  const story = useMemo(() => buildRangeSessionStory(entry.summary), [entry.summary]);
  const key =
    story.focusArea === 'direction'
      ? 'range.history.item_focus_direction'
      : story.focusArea === 'distance'
        ? 'range.history.item_focus_distance'
        : 'range.history.item_focus_contact';
  return <Text style={styles.focus}>{t(key)}</Text>;
}

function HistoryItem({ entry, onPress }: { entry: RangeHistoryEntry; onPress?: () => void }): JSX.Element {
  const clubLabel = entry.summary.club?.trim() || t('home.range.lastSession.anyClub');
  const dateLabel = formatDate(entry.savedAt || entry.summary.finishedAt);
  const goalLabel = entry.summary.trainingGoalText
    ? t('range.trainingGoal.history_item_label', { text: entry.summary.trainingGoalText })
    : null;
  const missionTitleKey =
    entry.summary.missionTitleKey || getMissionById(entry.summary.missionId ?? '')?.titleKey;
  const missionTitle = missionTitleKey
    ? t(missionTitleKey as any)
    : entry.summary.missionId
      ? entry.summary.missionId
      : null;
  const hasReflection = Boolean(entry.summary.sessionRating || entry.summary.reflectionNotes);
  return (
    <TouchableOpacity style={styles.item} testID="range-history-item" onPress={onPress}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemDate}>{dateLabel}</Text>
        <Text style={styles.itemShots}>{t('range.history.item_shots', { count: entry.summary.shotCount })}</Text>
      </View>
      <Text style={styles.itemClub}>{clubLabel}</Text>
      <FocusLabel entry={entry} />
      {goalLabel ? <Text style={styles.goal}>{goalLabel}</Text> : null}
      {missionTitle ? <Text style={styles.mission}>{t('range.missions.history_label', { title: missionTitle })}</Text> : null}
      {hasReflection ? <Text style={styles.reflection}>{t('range.reflection.history_label')}</Text> : null}
      {entry.summary.sharedToCoach ? <Text style={styles.shared}>{t('range.coachSummary.history_label')}</Text> : null}
    </TouchableOpacity>
  );
}

type Props = NativeStackScreenProps<RootStackParamList, 'RangeHistory'>;

export default function RangeHistoryScreen({ navigation }: Props): JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [history, setHistory] = useState<RangeHistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entries = await loadRangeHistory();
        if (!cancelled) {
          setHistory(entries);
        }
      } catch {
        if (!cancelled) {
          setHistory([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>{t('range.history.loading')}</Text>
      </View>
    );
  }

  if (history.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('range.history.empty_title')}</Text>
        <Text style={styles.subtitle}>{t('range.history.empty_subtitle')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('range.history.title')}</Text>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <HistoryItem
            entry={item}
            onPress={() => navigation.navigate('RangeSessionDetail', { summary: item.summary, savedAt: item.savedAt })}
          />
        )}
      />
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
  },
  subtitle: {
    color: '#4B5563',
  },
  loading: {
    color: '#4B5563',
    fontSize: 16,
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
    gap: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDate: {
    fontWeight: '700',
    color: '#111827',
  },
  itemShots: {
    color: '#374151',
  },
  itemClub: {
    color: '#111827',
    fontWeight: '600',
  },
  focus: {
    color: '#2563EB',
    fontWeight: '600',
  },
  goal: {
    color: '#374151',
  },
  mission: {
    color: '#2563EB',
  },
  reflection: {
    color: '#047857',
    fontWeight: '600',
  },
  shared: {
    color: '#2563EB',
    fontWeight: '600',
  },
});

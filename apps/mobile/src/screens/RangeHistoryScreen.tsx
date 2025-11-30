import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { t } from '@app/i18n';
import { buildRangeSessionStory } from '@app/range/rangeSessionStory';
import type { RangeHistoryEntry } from '@app/range/rangeHistoryStorage';
import { loadRangeHistory } from '@app/range/rangeHistoryStorage';

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

function HistoryItem({ entry }: { entry: RangeHistoryEntry }): JSX.Element {
  const clubLabel = entry.summary.club?.trim() || t('home.range.lastSession.anyClub');
  const dateLabel = formatDate(entry.savedAt || entry.summary.finishedAt);
  return (
    <View style={styles.item} testID="range-history-item">
      <View style={styles.itemHeader}>
        <Text style={styles.itemDate}>{dateLabel}</Text>
        <Text style={styles.itemShots}>{t('range.history.item_shots', { count: entry.summary.shotCount })}</Text>
      </View>
      <Text style={styles.itemClub}>{clubLabel}</Text>
      <FocusLabel entry={entry} />
    </View>
  );
}

export default function RangeHistoryScreen(): JSX.Element {
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
        renderItem={({ item }) => <HistoryItem entry={item} />}
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
});

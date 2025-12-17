import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { logPracticeJournalOpened, logPracticeSessionShared } from '@app/analytics/practiceJournal';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import {
  getPracticeSessionDurationMinutes,
  getPracticeStreakDays,
  getThisWeekTotals,
} from '@app/practice/practiceInsights';
import { loadPracticeSessions, type PracticeSession } from '@app/practice/practiceSessionStorage';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c0c0f', padding: 16, gap: 12 },
  header: { gap: 4 },
  title: { fontSize: 24, fontWeight: '700', color: '#f5f5f7' },
  subtitle: { color: '#b6b6c2' },
  card: { backgroundColor: '#16171f', borderRadius: 12, padding: 14, gap: 6 },
  list: { gap: 8, paddingBottom: 24 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  itemTitle: { color: '#f5f5f7', fontWeight: '700' },
  itemSubtitle: { color: '#b6b6c2' },
  shareButton: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#1f202a', borderRadius: 10 },
  shareText: { color: '#00c853', fontWeight: '700' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 40 },
  emptyTitle: { color: '#f5f5f7', fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: '#b6b6c2', textAlign: 'center' },
  primaryButton: {
    backgroundColor: '#00c853',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  primaryButtonText: { color: '#0c0c0f', fontWeight: '700' },
  secondaryButton: {
    backgroundColor: '#1f202a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  secondaryButtonText: { color: '#f5f5f7', fontWeight: '700' },
});

type Props = NativeStackScreenProps<RootStackParamList, 'PracticeJournal'>;

type ScreenState = {
  loading: boolean;
  sessions: PracticeSession[];
};

function formatSessionDate(session: PracticeSession): string {
  const date = session.endedAt || session.startedAt;
  if (!date) return t('practice.journal.share.date_fallback');
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return t('practice.journal.share.date_fallback');
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatSummary(session: PracticeSession): { label: string; minutes: number | null; drills: number } {
  const drillCount = session.drillIds?.length ?? 0;
  const minutes = getPracticeSessionDurationMinutes(session);
  const parts: string[] = [];
  if (minutes) parts.push(t('practice.journal.share.minutes', { minutes }));
  if (drillCount) parts.push(t('practice.journal.share.drills', { drills: drillCount }));
  const label = parts.join(' · ') || t('practice.journal.share.summary_fallback');
  return { label, minutes: minutes ?? null, drills: drillCount };
}

function buildShareText(session: PracticeSession): { text: string; minutes?: number; drills?: number } {
  const dateLabel = formatSessionDate(session);
  const summary = formatSummary(session);
  const focusText = ' ';
  const text = t('practice.journal.share.text_template', {
    date: dateLabel,
    summary: summary.label,
    focus: focusText,
  });
  return { text, minutes: summary.minutes ?? undefined, drills: summary.drills || undefined };
}

function SessionRow({ session, onPress, onShare }: {
  session: PracticeSession;
  onPress: () => void;
  onShare: () => void;
}): JSX.Element {
  const dateLabel = useMemo(() => formatSessionDate(session), [session]);
  const summaryLabel = useMemo(() => formatSummary(session).label, [session]);

  return (
    <View style={styles.card} testID="practice-journal-item">
      <View style={styles.item}>
        <TouchableOpacity onPress={onPress} style={{ flex: 1 }}>
          <Text style={styles.itemTitle}>{dateLabel}</Text>
          <Text style={styles.itemSubtitle}>{summaryLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onShare} testID={`practice-journal-share-${session.id}`}>
          <View style={styles.shareButton}>
            <Text style={styles.shareText}>{t('practice.journal.share.cta')}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function PracticeJournalScreen({ navigation }: Props): JSX.Element {
  const [state, setState] = useState<ScreenState>({ loading: true, sessions: [] });

  useEffect(() => {
    logPracticeJournalOpened();

    let cancelled = false;
    loadPracticeSessions()
      .then((list) => {
        if (!cancelled) {
          setState({ loading: false, sessions: Array.isArray(list) ? list : [] });
        }
      })
      .catch((err) => {
        console.warn('[practice-journal] Failed to load sessions', err);
        if (!cancelled) setState({ loading: false, sessions: [] });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedSessions = useMemo(
    () =>
      [...state.sessions].sort(
        (a, b) =>
          new Date(b.endedAt ?? b.startedAt ?? 0).getTime() -
          new Date(a.endedAt ?? a.startedAt ?? 0).getTime(),
      ),
    [state.sessions],
  );

  const streakDays = useMemo(() => getPracticeStreakDays(sortedSessions, new Date()), [sortedSessions]);
  const thisWeekTotals = useMemo(() => getThisWeekTotals(sortedSessions, new Date()), [sortedSessions]);

  const handleOpenWeeklySummary = () => {
    navigation.navigate('PracticeWeeklySummary', { source: 'journal' });
  };

  const handleShare = async (session: PracticeSession) => {
    try {
      const payload = buildShareText(session);
      await Share.share({ message: payload.text });
      logPracticeSessionShared({ sessionId: session.id, minutes: payload.minutes, drills: payload.drills });
    } catch (err) {
      console.warn('[practice-journal] Failed to share session', err);
    }
  };

  const handleSessionPress = (session: PracticeSession) => {
    const details = formatSummary(session);
    const completed = session.completedDrillIds?.length ?? 0;
    const lines = [details.label];
    if (completed) {
      lines.push(t('practice.journal.detail.completed', { drills: completed }));
    }
    Alert.alert(formatSessionDate(session), lines.join('\n'));
  };

  const renderContent = () => {
    if (state.loading) {
      return (
        <View style={[styles.empty, { paddingTop: 80 }]}> 
          <ActivityIndicator />
          <Text style={styles.subtitle}>{t('practicePlan.loading')}</Text>
        </View>
      );
    }

    if (sortedSessions.length === 0) {
      return (
        <View style={styles.empty} testID="practice-journal-empty">
          <Text style={styles.emptyTitle}>{t('practice.journal.empty.title')}</Text>
          <Text style={styles.emptySubtitle}>{t('practice.journal.empty.body')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('PracticeSession')} testID="practice-journal-start">
            <View style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('practice.journal.empty.cta_start')}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('PracticePlanner')} testID="practice-journal-planner">
            <View style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{t('home.practice.cta_view_plan')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        data={sortedSessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SessionRow
            session={item}
            onPress={() => handleSessionPress(item)}
            onShare={() => handleShare(item)}
          />
        )}
        contentContainerStyle={styles.list}
        testID="practice-journal-list"
      />
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('practice.journal.title')}</Text>
        <Text style={styles.subtitle}>{t('practice.journal.streak', { days: streakDays })}</Text>
        <Text style={styles.subtitle}>
          {t('practice.journal.this_week', {
            sessions: thisWeekTotals.sessionCount,
            minutes: thisWeekTotals.minutes,
          })}
        </Text>
        <TouchableOpacity onPress={handleOpenWeeklySummary} testID="practice-weekly-summary-from-journal">
          <Text style={styles.shareText}>{t('practice.weeklySummary.cta_view')}</Text>
        </TouchableOpacity>
      </View>

      {renderContent()}
    </View>
  );
}

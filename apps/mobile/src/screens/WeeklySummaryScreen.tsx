import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchWeeklySummary, type WeeklyFocusHint, type WeeklySummary } from '@app/api/weeklySummaryClient';
import { fetchDemoWeeklySummary } from '@app/demo/demoService';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { navigateToStartRound } from '@app/navigation/startRound';
import { focusHintToDrills, addDrillToPlan } from '@app/practice/focusHintToDrills';
import { loadCurrentWeekPracticePlan } from '@app/practice/practicePlanStorage';
import { safeEmit } from '@app/telemetry';

const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

type Props = NativeStackScreenProps<RootStackParamList, 'WeeklySummary'>;

function formatRange(start: string, end: string): string {
  const startLabel = formatter.format(new Date(start));
  const endLabel = formatter.format(new Date(end));
  return `${startLabel} – ${endLabel}`;
}

function buildShareMessage(summary: WeeklySummary): string {
  const highlight = summary.highlight?.value;
  const firstHint = summary.focusHints[0];
  return t('weekly.share.template', {
    rounds: summary.roundsPlayed,
    holes: summary.holesPlayed,
    highlight: highlight ? `Highlight: ${highlight}. ` : '',
    focus: firstHint ? `Focus: ${firstHint.text}. ` : '',
  });
}

function getHintId(hint: WeeklyFocusHint, index: number): string {
  return hint.id || `hint-${index}`;
}

export default function WeeklySummaryScreen({ navigation, route }: Props): JSX.Element {
  const { isDemo } = route.params ?? {};
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [sharing, setSharing] = useState(false);
  const [addingHintId, setAddingHintId] = useState<string | null>(null);
  const [addedHints, setAddedHints] = useState<Set<string>>(new Set());
  const [planProgress, setPlanProgress] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = isDemo ? await fetchDemoWeeklySummary() : await fetchWeeklySummary();
      setSummary(data);
      safeEmit('weekly_summary.viewed', { rounds: data.roundsPlayed, holes: data.holesPlayed });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('weekly.error');
      setError(message || t('weekly.error'));
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    load().catch(() => setError(t('weekly.error')));
  }, [load]);

  useEffect(() => {
    loadCurrentWeekPracticePlan()
      .then((plan) => {
        if (plan) {
          const done = plan.items.filter((item) => item.status === 'done').length;
          setPlanProgress({ done, total: plan.items.length });
        } else {
          setPlanProgress({ done: 0, total: 0 });
        }
      })
      .catch(() => setPlanProgress({ done: 0, total: 0 }));
  }, []);

  const hasRounds = (summary?.roundsPlayed ?? 0) > 0;

  const shareMessage = useMemo(() => (summary ? buildShareMessage(summary) : ''), [summary]);

  const handleShare = useCallback(async () => {
    if (!summary) return;
    setSharing(true);
    try {
      await Share.share({ message: shareMessage });
      safeEmit('weekly_summary.shared', {
        rounds: summary.roundsPlayed,
        holes: summary.holesPlayed,
        hasHighlight: Boolean(summary.highlight),
      });
    } finally {
      setSharing(false);
    }
  }, [shareMessage, summary]);

  const handleAddToPlan = useCallback(
    async (hint: WeeklyFocusHint, index: number) => {
      if (!summary) return;
      const suggestion = focusHintToDrills(hint, summary.focusCategory)[0];
      if (!suggestion) return;
      const id = getHintId(hint, index);
      setAddingHintId(id);
      try {
        await addDrillToPlan(suggestion.id, { type: 'weekly_focus_hint', hintId: hint.id });
        setAddedHints((prev) => new Set(prev).add(id));
      } finally {
        setAddingHintId(null);
      }
    },
    [summary],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>{t('weekly.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity onPress={() => load().catch(() => {})} testID="weekly-retry">
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{t('weekly.retry')}</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('weekly.error')}</Text>
      </View>
    );
  }

  const rangeLabel = formatRange(summary.startDate, summary.endDate);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <Text style={styles.title}>{t('weekly.title')}</Text>
      <Text style={styles.subtitle}>{rangeLabel}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {t('weekly.subtitle', { rounds: summary.roundsPlayed, holes: summary.holesPlayed })}
        </Text>
        <View style={styles.statRow}>
          <View style={styles.statTile}>
            <Text style={styles.statLabel}>{t('weekly.stats.rounds')}</Text>
            <Text style={styles.statValue}>{summary.roundsPlayed}</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statLabel}>{t('weekly.stats.holes')}</Text>
            <Text style={styles.statValue}>{summary.holesPlayed}</Text>
          </View>
        </View>
      </View>

      {hasRounds ? (
        <>
          {summary.highlight ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{summary.highlight.label}</Text>
              <Text style={styles.headline} testID="weekly-headline">
                {summary.highlight.value}
              </Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('weekly.focusTitle')}</Text>
            {summary.focusHints.length ? (
              summary.focusHints.map((hint, idx) => {
                const hintId = getHintId(hint, idx);
                const suggestions = focusHintToDrills(hint, summary.focusCategory) ?? [];
                const suggestion = suggestions[0];
                const added = addedHints.has(hintId);
                const isAdding = addingHintId === hintId;
                return (
                  <View style={styles.hintRow} key={hintId} testID={`weekly-hint-${hintId}`}>
                    <Text style={styles.hint}>• {hint.text}</Text>
                    {suggestion ? (
                      added ? (
                        <Text style={styles.addedLabel}>{t('practicePlan.added')}</Text>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleAddToPlan(hint, idx)}
                          disabled={isAdding}
                          testID={`add-plan-${hintId}`}
                        >
                          <View
                            style={[
                              styles.inlineButton,
                              isAdding ? styles.disabledButton : null,
                            ]}
                          >
                            {isAdding ? (
                              <ActivityIndicator color="#f5f5f7" />
                            ) : (
                              <Text style={styles.inlineButtonText}>{t('practicePlan.addToPlan')}</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      )
                    ) : null}
                  </View>
                );
              })
            ) : (
              <Text style={styles.muted}>{t('weekly.empty.body')}</Text>
            )}
            <TouchableOpacity onPress={() => navigation.navigate('PracticePlanner')} testID="weekly-view-plan">
              <Text style={styles.link}>{t('practicePlan.viewPlan')}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('weekly.empty.title')}</Text>
          <Text style={styles.muted}>{t('weekly.empty.body')}</Text>
          <View style={styles.ctaRow}>
            <TouchableOpacity onPress={() => navigateToStartRound(navigation, 'home')} testID="weekly-empty-start-round">
              <View style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{t('weekly.cta.startRound')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('RangePractice')} testID="weekly-empty-range">
              <View style={[styles.primaryButton, styles.secondaryButton]}>
                <Text style={styles.primaryButtonText}>{t('weekly.cta.range')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.card} testID="weekly-practice-card">
        <Text style={styles.cardTitle}>{t('practicePlan.title')}</Text>
        {planProgress && planProgress.total > 0 ? (
          <Text style={styles.muted} testID="weekly-practice-progress">
            {t('weekly.practice.progress', { done: planProgress.done, total: planProgress.total })}
          </Text>
        ) : (
          <Text style={styles.muted}>{t('practicePlan.emptyBody')}</Text>
        )}
        <View style={styles.ctaRow}>
          <TouchableOpacity onPress={() => navigation.navigate('PracticeSession')} testID="weekly-start-practice">
            <View style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('practice.session.start')}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('PracticePlanner')} testID="weekly-practice-view-plan">
            <View style={[styles.primaryButton, styles.secondaryButton]}>
              <Text style={styles.primaryButtonText}>{t('practicePlan.viewPlan')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, sharing ? styles.disabledButton : null]}
        onPress={handleShare}
        disabled={sharing}
        testID="weekly-share"
      >
        {sharing ? <ActivityIndicator color="#0c0c0f" /> : <Text style={styles.primaryButtonText}>{t('weekly.share.cta')}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c0c0f' },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#f5f5f7' },
  subtitle: { color: '#b6b6c2' },
  card: { backgroundColor: '#16171f', borderRadius: 12, padding: 16, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#f5f5f7' },
  headline: { fontSize: 18, fontWeight: '700', color: '#f5f5f7' },
  statRow: { flexDirection: 'row', gap: 12 },
  statTile: { flex: 1, backgroundColor: '#1f202a', padding: 12, borderRadius: 10, gap: 4 },
  statLabel: { color: '#8a8a94' },
  statValue: { color: '#f5f5f7', fontSize: 22, fontWeight: '700' },
  hint: { color: '#f5f5f7' },
  muted: { color: '#8a8a94' },
  error: { color: '#ff8a8a', textAlign: 'center' },
  primaryButton: {
    backgroundColor: '#00c853',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#0c0c0f', fontWeight: '700' },
  secondaryButton: { backgroundColor: '#2a2b35' },
  disabledButton: { opacity: 0.7 },
  ctaRow: { flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  inlineButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2b35',
    backgroundColor: '#1b1c24',
  },
  inlineButtonText: { color: '#f5f5f7', fontWeight: '700' },
  addedLabel: { color: '#00c853', fontWeight: '700' },
  link: { color: '#00c853', fontWeight: '700', marginTop: 8 },
});

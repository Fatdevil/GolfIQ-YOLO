import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  logPracticeWeeklySummaryShare,
  logPracticeWeeklySummaryStartPractice,
  logPracticeWeeklySummaryViewed,
} from '@app/analytics/practiceWeeklySummary';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { buildPracticeWeeklySummary, type PracticeWeeklySummary } from '@app/practice/practiceWeeklySummary';
import { loadCurrentWeekPracticePlan } from '@app/practice/practicePlanStorage';
import { loadPracticeSessions } from '@app/practice/practiceSessionStorage';
import { isPracticeGrowthV1Enabled } from '@shared/featureFlags/practiceGrowthV1';
import { logPracticeFeatureGated, type PracticeFeatureGateSource } from '@app/analytics/practiceFeatureGate';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c0c0f', padding: 16, gap: 12 },
  header: { gap: 4 },
  title: { fontSize: 24, fontWeight: '700', color: '#f5f5f7' },
  subtitle: { color: '#b6b6c2' },
  card: { backgroundColor: '#16171f', borderRadius: 12, padding: 14, gap: 8 },
  sectionTitle: { color: '#f5f5f7', fontWeight: '700', fontSize: 18 },
  statRow: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  pill: { backgroundColor: '#1f202a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  pillText: { color: '#f5f5f7', fontWeight: '700' },
  muted: { color: '#b6b6c2' },
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

type Props = NativeStackScreenProps<RootStackParamList, 'PracticeWeeklySummary'>;

type ScreenState = {
  loading: boolean;
  summary: PracticeWeeklySummary | null;
};

function formatRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  end.setDate(end.getDate() - 1);
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

function buildShareText(summary: PracticeWeeklySummary): string {
  const parts = [
    t('practice.weeklySummary.share.sessions', { count: summary.sessionsCount }),
    t('practice.weeklySummary.share.drills', { count: summary.drillsCompleted }),
  ];
  if (summary.minutesTotal) {
    parts.splice(1, 0, t('practice.weeklySummary.share.minutes', { minutes: summary.minutesTotal }));
  }
  const streak = t('practice.weeklySummary.share.streak', { days: summary.streakDays });
  return `${t('practice.weeklySummary.share.prefix')} ${parts.join(' · ')} · ${streak}. ${t('practice.weeklySummary.share.suffix')}`;
}

export default function PracticeWeeklySummaryScreen({ navigation, route }: Props): JSX.Element {
  const [state, setState] = useState<ScreenState>({ loading: true, summary: null });
  const practiceGrowthEnabled = isPracticeGrowthV1Enabled();

  const analyticsSource = useMemo(
    () => (route.params?.source === 'home' || route.params?.source === 'journal' ? route.params.source : undefined),
    [route.params?.source],
  );

  const analyticsContext = useMemo(
    () => ({
      source: analyticsSource,
    }),
    [analyticsSource],
  );

  useEffect(() => {
    if (practiceGrowthEnabled) return;

    const source: PracticeFeatureGateSource =
      route.params?.source === 'home' ? 'home' : route.params?.source === 'journal' ? 'home' : 'deeplink';
    logPracticeFeatureGated({ feature: 'practiceGrowthV1', target: 'PracticeWeeklySummary', source });
    navigation.navigate('HomeDashboard');
  }, [navigation, practiceGrowthEnabled, route.params?.source]);

  useEffect(() => {
    if (!practiceGrowthEnabled) return undefined;

    let cancelled = false;
    Promise.all([loadPracticeSessions(), loadCurrentWeekPracticePlan()])
      .then(([sessions, plan]) => {
        if (cancelled) return;
        const summary = buildPracticeWeeklySummary(Array.isArray(sessions) ? sessions : [], plan, new Date());
        setState({ loading: false, summary });
        logPracticeWeeklySummaryViewed({
          sessionsCount: summary.sessionsCount,
          drillsCompleted: summary.drillsCompleted,
          streakDays: summary.streakDays,
          hasPlan: summary.hasPlan,
          planCompletionPct: summary.planCompletionPct,
          source: analyticsContext.source,
        });
      })
      .catch((err) => {
        console.warn('[practice-weekly-summary] Failed to load data', err);
        if (!cancelled) {
          const summary = buildPracticeWeeklySummary([], null, new Date());
          setState({ loading: false, summary });
          logPracticeWeeklySummaryViewed({
            sessionsCount: summary.sessionsCount,
            drillsCompleted: summary.drillsCompleted,
            streakDays: summary.streakDays,
            hasPlan: summary.hasPlan,
            planCompletionPct: summary.planCompletionPct,
            source: analyticsContext.source,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [analyticsContext.source, practiceGrowthEnabled]);

  const handleShare = useCallback(async () => {
    if (!state.summary) return;
    try {
      const message = buildShareText(state.summary);
      await Share.share({ message });
      logPracticeWeeklySummaryShare({
        sessionsCount: state.summary.sessionsCount,
        drillsCompleted: state.summary.drillsCompleted,
        streakDays: state.summary.streakDays,
        hasPlan: state.summary.hasPlan,
        planCompletionPct: state.summary.planCompletionPct,
        source: analyticsContext.source,
      });
    } catch (err) {
      console.warn('[practice-weekly-summary] Failed to share week', err);
    }
  }, [analyticsContext.source, state.summary]);

  const handleStartPractice = useCallback(() => {
    if (!state.summary) return;
    logPracticeWeeklySummaryStartPractice({
      sessionsCount: state.summary.sessionsCount,
      drillsCompleted: state.summary.drillsCompleted,
      streakDays: state.summary.streakDays,
      hasPlan: state.summary.hasPlan,
      planCompletionPct: state.summary.planCompletionPct,
      source: analyticsContext.source,
    });
    navigation.navigate('PracticeSession');
  }, [analyticsContext.source, navigation, state.summary]);

  if (!practiceGrowthEnabled) {
    return <View style={styles.container} />;
  }

  if (state.loading || !state.summary) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator />
        <Text style={styles.subtitle}>{t('practicePlan.loading')}</Text>
      </View>
    );
  }

  const weekLabel = formatRange(state.summary.weekStartISO, state.summary.weekEndISO);
  const planPercent = typeof state.summary.planCompletionPct === 'number'
    ? Math.round(state.summary.planCompletionPct * 100)
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('practice.weeklySummary.title')}</Text>
        <Text style={styles.subtitle}>{weekLabel}</Text>
      </View>

      <View style={styles.card} testID="practice-weekly-this-week">
        <Text style={styles.sectionTitle}>{t('practice.weeklySummary.this_week')}</Text>
        <View style={styles.statRow}>
          <View style={styles.pill}>
            <Text style={styles.pillText} testID="practice-weekly-sessions">
              {t('practice.weeklySummary.sessions', { count: state.summary.sessionsCount })}
            </Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillText} testID="practice-weekly-drills">
              {t('practice.weeklySummary.drills', { count: state.summary.drillsCompleted })}
            </Text>
          </View>
          {state.summary.minutesTotal ? (
            <View style={styles.pill}>
              <Text style={styles.pillText} testID="practice-weekly-minutes">
                {t('practice.weeklySummary.minutes', { minutes: state.summary.minutesTotal })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.card} testID="practice-weekly-streak">
        <Text style={styles.sectionTitle}>{t('practice.weeklySummary.streak_title')}</Text>
        <Text style={styles.muted}>
          {t('practice.weeklySummary.streak', { days: state.summary.streakDays })}
        </Text>
      </View>

      <View style={styles.card} testID="practice-weekly-plan">
        <Text style={styles.sectionTitle}>{t('practice.weeklySummary.plan_title')}</Text>
        {state.summary.hasPlan && planPercent !== null ? (
          <Text style={styles.muted} testID="practice-weekly-plan-progress">
            {t('practice.weeklySummary.plan_progress', { percent: planPercent })}
          </Text>
        ) : (
          <Text style={styles.muted}>{t('practice.weeklySummary.plan_empty')}</Text>
        )}
      </View>

      <TouchableOpacity onPress={handleStartPractice} testID="practice-weekly-start">
        <View style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{t('practice.weeklySummary.start_cta')}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleShare} testID="practice-weekly-share">
        <View style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{t('practice.weeklySummary.share_cta')}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

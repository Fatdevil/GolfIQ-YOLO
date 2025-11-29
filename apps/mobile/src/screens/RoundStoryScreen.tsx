import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchCoachRoundSummary, fetchRoundSg, fetchSessionTimeline } from '@app/api/roundStory';
import { fetchAccessPlan, type AccessPlan } from '@app/api/player';
import type { RootStackParamList } from '@app/navigation/types';
import { buildHighlights, buildRoundStoryViewModel } from '@app/roundStory/model';
import { loadLastRoundSummary, type LastRoundSummary } from '@app/run/lastRound';

type Props = NativeStackScreenProps<RootStackParamList, 'RoundStory'>;

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function bestCategorySummary(sg?: { categories: { name: string; strokesGained: number }[] } | null): string | null {
  if (!sg?.categories?.length) return null;
  const sorted = [...sg.categories].sort((a, b) => b.strokesGained - a.strokesGained);
  const best = sorted[0];
  if (!best) return null;
  return `${best.name}: ${best.strokesGained >= 0 ? '+' : ''}${best.strokesGained.toFixed(1)} SG`;
}

export default function RoundStoryScreen({ route, navigation }: Props): JSX.Element {
  const params = route.params ?? { runId: '', summary: undefined };
  const { runId, summary: initialSummary } = params;
  const [summary, setSummary] = useState<LastRoundSummary | null>(initialSummary ?? null);
  const [plan, setPlan] = useState<AccessPlan | null>(null);
  const [sg, setSg] = useState<Awaited<ReturnType<typeof fetchRoundSg>> | null>(null);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [coach, setCoach] = useState<Awaited<ReturnType<typeof fetchCoachRoundSummary>>>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [sgError, setSgError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadLastRoundSummary();
      if (!cancelled && stored?.runId === runId) {
        setSummary(stored);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingPlan(true);
        const access = await fetchAccessPlan();
        if (!cancelled) {
          setPlan(access);
        }
      } catch (err) {
        if (!cancelled) {
          setPlan({ plan: 'free' });
        }
      } finally {
        if (!cancelled) {
          setLoadingPlan(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setSgError(null);
        const sgSummary = await fetchRoundSg(runId);
        if (!cancelled) {
          setSg(sgSummary);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unable to load strokes gained';
          setSgError(message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    if (!plan || plan.plan !== 'pro') return;
    let cancelled = false;
    setLoadingAnalytics(true);
    setAnalyticsError(null);
    Promise.all([fetchSessionTimeline(runId), fetchCoachRoundSummary(runId)])
      .then(([timeline, coachSummary]) => {
        if (cancelled) return;
        setHighlights(buildHighlights(timeline.events));
        setCoach(coachSummary);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unable to load analytics';
        setAnalyticsError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingAnalytics(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [plan, runId]);

  const viewModel = useMemo(
    () =>
      buildRoundStoryViewModel({
        runId,
        summary,
        sg,
        highlights,
        coach,
        isPro: plan?.plan === 'pro',
      }),
    [coach, highlights, plan?.plan, runId, sg, summary],
  );

  const dateLabel = formatDate(summary?.finishedAt) ?? 'Recent round';
  const scoreLabel = summary?.relativeToPar ?? `${summary?.totalStrokes ?? 0} strokes`;
  const isPro = plan?.plan === 'pro';
  const planLabel = loadingPlan ? 'Loading…' : isPro ? 'Pro' : 'Pro preview';
  const bestCategory = bestCategorySummary(sg);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header} testID="round-story-header">
        <Text style={styles.title}>{viewModel.courseName}</Text>
        <Text style={styles.subtitle}>{viewModel.teeName}</Text>
        <Text style={styles.meta}>
          {viewModel.holes} holes · {dateLabel}
        </Text>
        <Text style={styles.score}>{scoreLabel}</Text>
        <Text style={styles.meta}>Run ID: {runId}</Text>
      </View>

      {sgError && <Text style={styles.errorText}>{sgError}</Text>}

      <View style={styles.section} testID="sg-summary">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Strokes gained</Text>
          <Text style={styles.planPill}>{planLabel}</Text>
        </View>

        {sg && isPro && (
          <View style={styles.card}>
            <Text style={styles.statLabel}>Total</Text>
            <Text style={styles.statValue}>{sg.total >= 0 ? '+' : ''}{sg.total.toFixed(1)}</Text>
            <View style={styles.sgRow}>
              {sg.categories.map((cat) => (
                <View key={cat.name} style={styles.sgItem}>
                  <Text style={styles.sgLabel}>{cat.name}</Text>
                  <Text style={styles.sgValue}>{cat.strokesGained >= 0 ? '+' : ''}{cat.strokesGained.toFixed(1)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {!isPro && (
          <View style={[styles.card, styles.lockedCard]} testID="sg-preview-locked">
            <Text style={styles.lockedTitle}>Upgrade to unlock full Round Story</Text>
            <Text style={styles.meta}>
              See strokes gained per category, timeline highlights, and AI coach insights for every round.
            </Text>
            {bestCategory && <Text style={styles.previewText}>Best this round: {bestCategory}</Text>}
            <TouchableOpacity accessibilityLabel="Upgrade to Pro" testID="upgrade-cta">
              <View style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Upgrade to Pro</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isPro && (
        <View style={styles.section} testID="timeline-highlights">
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Timeline highlights</Text>
            {loadingAnalytics && <ActivityIndicator size="small" />}
          </View>
          {analyticsError && <Text style={styles.errorText}>{analyticsError}</Text>}
          {highlights.length ? (
            <View style={styles.card}>
              {highlights.map((line, idx) => (
                <Text key={idx} style={styles.listItem}>
                  • {line}
                </Text>
              ))}
            </View>
          ) : (
            !loadingAnalytics && <Text style={styles.emptyText}>No timeline highlights yet.</Text>
          )}
        </View>
      )}

      {isPro && (
        <View style={styles.section} testID="coach-insights">
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Coach insights</Text>
            {loadingAnalytics && <ActivityIndicator size="small" />}
          </View>
          {analyticsError && <Text style={styles.errorText}>{analyticsError}</Text>}
          <View style={styles.card}>
            <Text style={styles.statLabel}>Strengths</Text>
            {(viewModel.strengths.length ? viewModel.strengths : ['Dialed in ball striking.']).map((line, idx) => (
              <Text key={`s-${idx}`} style={styles.listItem}>
                • {line}
              </Text>
            ))}
            <Text style={[styles.statLabel, { marginTop: 12 }]}>Focus</Text>
            {(viewModel.focus.length ? viewModel.focus : ['Sharpen wedge distance control.']).map((line, idx) => (
              <Text key={`f-${idx}`} style={styles.listItem}>
                • {line}
              </Text>
            ))}
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity onPress={() => navigation.navigate('PlayerHome')} testID="round-story-home">
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Back to Home</Text>
          </View>
        </TouchableOpacity>
        <View style={[styles.secondaryButton, styles.disabledButton]}>
          <Text style={[styles.secondaryButtonText, styles.disabledText]}>Share Round (soon)</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 12,
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  subtitle: {
    color: '#e5e7eb',
    fontWeight: '600',
  },
  meta: {
    color: '#cbd5e1',
  },
  score: {
    color: '#4ade80',
    fontSize: 18,
    fontWeight: '800',
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  planPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#eef2ff',
    color: '#4338ca',
    borderRadius: 999,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  lockedCard: {
    backgroundColor: '#f8fafc',
    borderStyle: 'dashed',
  },
  lockedTitle: {
    fontWeight: '700',
    color: '#0f172a',
    fontSize: 16,
  },
  statLabel: {
    color: '#334155',
    fontWeight: '700',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  sgRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sgItem: {
    padding: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    minWidth: 120,
  },
  sgLabel: {
    fontWeight: '700',
    color: '#0f172a',
  },
  sgValue: {
    color: '#0f172a',
  },
  listItem: {
    color: '#0f172a',
  },
  emptyText: {
    color: '#94a3b8',
  },
  previewText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  actions: {
    gap: 10,
    marginTop: 10,
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
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  disabledButton: {
    backgroundColor: '#e2e8f0',
  },
  disabledText: {
    color: '#94a3b8',
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '700',
  },
});


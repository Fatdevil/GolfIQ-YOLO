import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchCoachRoundSummary, fetchRoundSg, fetchSessionTimeline } from '@app/api/roundStory';
import { fetchRoundRecap } from '@app/api/roundClient';
import { fetchAccessPlan, type AccessPlan } from '@app/api/player';
import type { RootStackParamList } from '@app/navigation/types';
import { buildHighlights, buildRoundStoryViewModel } from '@app/roundStory/model';
import { loadLastRoundSummary, type LastRoundSummary } from '@app/run/lastRound';
import { loadPracticeMissionHistory } from '@app/storage/practiceMissionHistory';
import { loadWeeklyPracticeGoalSettings } from '@app/storage/practiceGoalSettings';
import { safeEmit } from '@app/telemetry';
import { t } from '@app/i18n';
import { buildPracticeReadinessSummary } from '@shared/practice/practiceReadiness';
import { emitPracticeReadinessViewed } from '@shared/practice/practiceReadinessAnalytics';
import { getDefaultWeeklyPracticeGoalSettings } from '@shared/practice/practiceGoalSettings';
import type { PracticeMissionHistoryEntry } from '@shared/practice/practiceHistory';
import type { StrokesGainedLightTrend } from '@shared/stats/strokesGainedLight';

const PRO_TEASER = 'Unlock full analysis (SG and swing insights) with GolfIQ Pro.';

const friendlyCategoryLabel = (name: string): string => {
  switch (name.toLowerCase()) {
    case 'off tee':
      return 'Tee performance';
    case 'approach':
      return 'Approach shots';
    case 'short game':
      return 'Short game';
    case 'putting':
      return 'Putting';
    default:
      return name;
  }
};

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatSg(value?: number | null): string {
  if (typeof value !== 'number') return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
}

function sgLightCategoryLabel(category: keyof StrokesGainedLightTrend['perCategory']): string {
  const key = {
    tee: 'round.story.sgLightTrendCategory.tee',
    approach: 'round.story.sgLightTrendCategory.approach',
    short_game: 'round.story.sgLightTrendCategory.short_game',
    putting: 'round.story.sgLightTrendCategory.putting',
  }[category];

  return t(key);
}

function bestCategorySummary(sg?: { categories: { name: string; strokesGained: number }[] } | null): string | null {
  if (!sg?.categories?.length) return null;
  const sorted = [...sg.categories].sort((a, b) => b.strokesGained - a.strokesGained);
  const best = sorted[0];
  if (!best) return null;
  return `${friendlyCategoryLabel(best.name)}: ${formatSg(best.strokesGained)}`;
}

function worstCategoryLabel(sg?: { categories: { name: string; strokesGained: number }[] } | null): string | null {
  if (!sg?.categories?.length) return null;
  const sorted = [...sg.categories].sort((a, b) => a.strokesGained - b.strokesGained);
  return sorted[0] ? friendlyCategoryLabel(sorted[0].name) : null;
}

type Props = NativeStackScreenProps<RootStackParamList, 'RoundStory'>;

export default function RoundStoryScreen({ route, navigation }: Props): JSX.Element {
  const params = route.params ?? { runId: '', summary: undefined };
  const { runId, summary: initialSummary } = params;
  const [summary, setSummary] = useState<LastRoundSummary | null>(initialSummary ?? null);
  const [plan, setPlan] = useState<AccessPlan | null>(null);
  const [sg, setSg] = useState<Awaited<ReturnType<typeof fetchRoundSg>> | null>(null);
  const [sgLightTrend, setSgLightTrend] = useState<StrokesGainedLightTrend | null>(null);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [coach, setCoach] = useState<Awaited<ReturnType<typeof fetchCoachRoundSummary>>>(null);
  const [practiceHistory, setPracticeHistory] = useState<PracticeMissionHistoryEntry[]>([]);
  const [weeklyGoalSettings, setWeeklyGoalSettings] = useState(getDefaultWeeklyPracticeGoalSettings());
  const [loadingPractice, setLoadingPractice] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [loadingSg, setLoadingSg] = useState(false);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [sgError, setSgError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const trendImpressionSent = useRef(false);

  useEffect(() => {
    trendImpressionSent.current = false;
  }, [runId, reloadToken]);

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
    setLoadingPractice(true);

    Promise.all([
      loadPracticeMissionHistory().catch(() => []),
      loadWeeklyPracticeGoalSettings().catch(() => getDefaultWeeklyPracticeGoalSettings()),
    ])
      .then(([history, settings]) => {
        if (cancelled) return;
        setPracticeHistory(history ?? []);
        setWeeklyGoalSettings(settings ?? getDefaultWeeklyPracticeGoalSettings());
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[round-story] Failed to load practice readiness', err);
        setPracticeHistory([]);
        setWeeklyGoalSettings(getDefaultWeeklyPracticeGoalSettings());
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPractice(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setSgError(null);
        setLoadingSg(true);
        const sgSummary = await fetchRoundSg(runId);
        if (!cancelled) {
          setSg(sgSummary);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unable to load strokes gained';
          setSgError(message);
          setSg(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingSg(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, reloadToken]);

  useEffect(() => {
    let cancelled = false;
    setLoadingTrend(true);
    fetchRoundRecap(runId)
      .then((recap) => {
        if (cancelled) return;
        setSgLightTrend(recap.strokesGainedLightTrend ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setSgLightTrend(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingTrend(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [runId, reloadToken]);

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
        setHighlights([]);
        setCoach(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingAnalytics(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [plan, runId, reloadToken]);

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
  const scoreLabel = summary?.relativeToPar
    ? `${summary.totalStrokes} (${summary.relativeToPar})`
    : `${summary?.totalStrokes ?? 0} strokes`;
  const isPro = plan?.plan === 'pro';
  const bestCategory = bestCategorySummary(sg);
  const worstCategory = worstCategoryLabel(sg);
  const practiceFocus = coach?.focus?.[0] ?? worstCategory ?? null;
  const practiceCtaLabel = practiceFocus
    ? `Practice ${practiceFocus} on range`
    : 'Range practice';
  const isGuest = Boolean((summary as LastRoundSummary & { isGuest?: boolean })?.isGuest);
  const showAnalysisError = Boolean((sgError && !sg) || (analyticsError && isPro));
  const isLoadingAnything = loadingPlan || loadingSg || loadingTrend || (isPro && loadingAnalytics);
  const sgLightFocusHistory = sgLightTrend?.focusHistory ?? [];
  const currentSgLightFocus = sgLightFocusHistory[0]?.focusCategory ?? null;
  const sgLightTrendSubtitle = sgLightTrend
    ? t('round.story.sgLightTrendSubtitle', { rounds: sgLightTrend.windowSize })
    : null;
  const sgLightTrendCategories = useMemo(
    () => {
      if (!sgLightTrend) return [];
      const categories: (keyof StrokesGainedLightTrend['perCategory'])[] = [
        'tee',
        'approach',
        'short_game',
        'putting',
      ];
      return categories.map((category) => ({
        category,
        label: sgLightCategoryLabel(category),
        value: sgLightTrend.perCategory?.[category]?.avgDelta ?? null,
      }));
    },
    [sgLightTrend],
  );

  const keyStatsChips = useMemo(() => {
    if (!isPro || !sg) return [];
    const baseChips = [
      { label: 'Total SG', value: formatSg(sg.total) },
      ...sg.categories.map((cat) => ({
        label: friendlyCategoryLabel(cat.name),
        value: formatSg(cat.strokesGained),
      })),
    ];
    return baseChips.slice(0, 4);
  }, [isPro, sg]);

  const quickCoachNote = useMemo(() => {
    if (isPro) return null;
    if (bestCategory) return `Best area this round: ${bestCategory}.`;
    return 'Keep the ball in play and trust your routine next round.';
  }, [bestCategory, isPro]);

  const practiceReadiness = useMemo(
    () =>
      buildPracticeReadinessSummary({
        history: practiceHistory,
        goalSettings: weeklyGoalSettings,
        now: new Date(),
      }),
    [practiceHistory, weeklyGoalSettings],
  );

  useEffect(() => {
    if (loadingPractice || !practiceReadiness) return;
    emitPracticeReadinessViewed(
      { emit: safeEmit },
      {
        surface: 'round_story',
        platform: 'mobile',
        roundId: runId,
        summary: practiceReadiness,
      },
    );
  }, [loadingPractice, practiceReadiness, runId]);

  useEffect(() => {
    if (!sgLightTrend || trendImpressionSent.current) return;
    trendImpressionSent.current = true;
    safeEmit('sg_light_trend_viewed', {
      surface: 'round_story',
      platform: 'mobile',
      roundId: runId,
      windowSize: sgLightTrend.windowSize,
      focusCategory: sgLightTrend.focusHistory[0]?.focusCategory ?? null,
    });
  }, [runId, sgLightTrend]);

  const onRetry = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerCard} testID="round-story-header">
        <Text style={styles.sectionEyebrow}>Round overview</Text>
        <Text style={styles.title}>{viewModel.courseName}</Text>
        <Text style={styles.subtitle}>
          {viewModel.teeName} · {viewModel.holes || '—'} holes · {dateLabel}
        </Text>
        {isGuest && <Text style={styles.guestPill}>Guest round – does not affect your stats.</Text>}
        <View style={styles.scoreRow}>
          <View>
            <Text style={styles.scoreLabel}>Score</Text>
            <Text style={styles.scoreValue}>{scoreLabel}</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{loadingPlan ? 'Loading plan…' : isPro ? 'Pro' : 'Free'}</Text>
          </View>
        </View>
      </View>

      {showAnalysisError && (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.errorTitle}>We couldn’t load the detailed analysis right now.</Text>
          <Text style={styles.errorText}>Please check your connection and try again.</Text>
          <TouchableOpacity onPress={onRetry} accessibilityLabel="Retry loading round story">
            <View style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Retry</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section} testID="key-stats">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Key stats</Text>
          {isLoadingAnything && <ActivityIndicator size="small" />}
        </View>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.statLabel}>Score vs par</Text>
            <Text style={styles.statValue}>{scoreLabel}</Text>
          </View>
          {loadingSg && (
            <View style={styles.inlineRow}>
              <ActivityIndicator size="small" />
              <Text style={styles.meta}>Loading round analysis…</Text>
            </View>
          )}
          {isPro && keyStatsChips.length > 0 && !loadingSg && (
            <View style={styles.chipGrid}>
              {keyStatsChips.map((chip) => (
                <View key={chip.label} style={styles.chip}>
                  <Text style={styles.chipLabel}>{chip.label}</Text>
                  <Text style={styles.chipValue}>{chip.value}</Text>
                </View>
              ))}
            </View>
          )}
          {!isPro && !loadingSg && (
            <View style={styles.callout}>
              <Text style={styles.calloutText}>{quickCoachNote}</Text>
              {bestCategory && <Text style={styles.meta}>Most solid: {bestCategory}</Text>}
            </View>
          )}
          {!loadingSg && !sg && !sgError && (
            <Text style={styles.meta}>No strokes gained data available for this round.</Text>
          )}
        </View>
      </View>

      <View style={styles.section} testID="sg-light-trend">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('round.story.sgLightTrendTitle')}</Text>
          {(loadingTrend || loadingSg) && <ActivityIndicator size="small" />}
        </View>
        <View style={styles.card}>
          {sgLightTrend ? (
            <>
              {sgLightTrendSubtitle && <Text style={styles.meta}>{sgLightTrendSubtitle}</Text>}
              <View style={styles.chipGrid}>
                {sgLightTrendCategories.map((entry) => (
                  <View
                    key={entry.category}
                    style={[styles.chip, currentSgLightFocus === entry.category && styles.focusChip]}
                  >
                    <View style={styles.chipHeaderRow}>
                      <Text style={styles.chipLabel}>{entry.label}</Text>
                      {currentSgLightFocus === entry.category && (
                        <Text style={styles.focusBadge}>{t('round.story.sgLightTrendFocusBadge')}</Text>
                      )}
                    </View>
                    <Text style={styles.chipValue}>{formatSg(entry.value)}</Text>
                  </View>
                ))}
              </View>

              {sgLightFocusHistory.length > 0 && (
                <View style={styles.focusHistory}>
                  <Text style={styles.meta}>{t('round.story.sgLightTrendFocusHistoryTitle')}</Text>
                  {sgLightFocusHistory.map((entry, idx) => (
                    <Text key={`${entry.roundId}-${idx}`} style={styles.listItem}>
                      • {sgLightCategoryLabel(entry.focusCategory)} ·{' '}
                      {formatDate(entry.playedAt) ?? entry.playedAt}
                    </Text>
                  ))}
                </View>
              )}
            </>
          ) : (
            <Text style={styles.meta}>{t('weeklySummary.notEnough')}</Text>
          )}
        </View>
      </View>

      <View style={styles.section} testID="timeline-highlights">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Highlights</Text>
          {isPro && loadingAnalytics && <ActivityIndicator size="small" />}
        </View>
        {isPro ? (
          <View style={styles.card}>
            {analyticsError && <Text style={styles.meta}>We could not load highlights right now.</Text>}
            {!loadingAnalytics && !highlights.length && !analyticsError && (
              <Text style={styles.meta}>{t('round.story.highlightsUnavailable')}</Text>
            )}
            {highlights.map((line, idx) => (
              <Text key={idx} style={styles.listItem}>
                • {line}
              </Text>
            ))}
          </View>
        ) : (
          <View style={[styles.card, styles.previewCard]}>
            <Text style={styles.previewTitle}>Detailed stats are part of GolfIQ Pro.</Text>
            <Text style={styles.meta}>{PRO_TEASER}</Text>
          </View>
        )}
      </View>

      <View style={styles.section} testID="coach-insights">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Coach insights</Text>
          {isPro && loadingAnalytics && <ActivityIndicator size="small" />}
        </View>
        <View style={styles.card}>
          {isPro ? (
            <>
              {!loadingAnalytics && !viewModel.strengths.length && !viewModel.focus.length && (
                <Text style={styles.meta}>{t('round.story.coachInsightsUnavailable')}</Text>
              )}
              <Text style={styles.blockTitle}>Strengths</Text>
              {(viewModel.strengths.length ? viewModel.strengths : ['Solid ball striking overall.']).map(
                (line, idx) => (
                  <Text key={`s-${idx}`} style={styles.listItem}>
                    • {line}
                  </Text>
                ),
              )}
              <Text style={styles.blockTitle}>Focus for next rounds</Text>
              {(viewModel.focus.length ? viewModel.focus : ['Sharpen wedge distance control.']).map((line, idx) => (
                <Text key={`f-${idx}`} style={styles.listItem}>
                  • {line}
                </Text>
              ))}
            </>
          ) : (
            <>
              <Text style={styles.blockTitle}>Quick note</Text>
              <Text style={styles.listItem}>{quickCoachNote}</Text>
            </>
          )}
        </View>
      </View>

      {!loadingPractice ? (
        <View style={styles.section} testID="practice-readiness">
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('round.story.practiceTitle')}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.statLabel}>
              {t('round.story.practiceSessions', { count: practiceReadiness.sessionsCompleted })}
            </Text>
            <Text style={styles.meta}>
              {t('round.story.practiceShots', { count: practiceReadiness.shotsCompleted })}
            </Text>
            <Text style={practiceReadiness.goalReached ? styles.successText : styles.meta}>
              {practiceReadiness.goalTarget == null
                ? t('round.story.practiceGoalUnavailable')
                : practiceReadiness.goalReached
                  ? t('round.story.practiceGoalReached')
                  : t('round.story.practiceGoalProgress', {
                      progress: practiceReadiness.goalProgress,
                      target: practiceReadiness.goalTarget,
                    })}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Next steps</Text>
        </View>
        <View style={styles.card}>
          <TouchableOpacity onPress={() => navigation.navigate('RangePractice')} testID="next-step-range">
            <View style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{practiceCtaLabel}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('PlayCourseSelect')} testID="next-step-round">
            <View style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Play another round</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('HomeDashboard')} testID="round-story-home">
            <View style={styles.linkButton}>
              <Text style={styles.linkButtonText}>Back to Home</Text>
            </View>
          </TouchableOpacity>
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
  headerCard: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 14,
    gap: 8,
  },
  sectionEyebrow: {
    color: '#cbd5e1',
    fontWeight: '700',
    fontSize: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  subtitle: {
    color: '#e5e7eb',
    fontWeight: '600',
  },
  guestPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#1e293b',
    color: '#e2e8f0',
    borderRadius: 999,
    alignSelf: 'flex-start',
    fontWeight: '700',
    fontSize: 12,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1e293b',
    borderRadius: 999,
  },
  pillText: {
    color: '#cbd5e1',
    fontWeight: '700',
  },
  scoreLabel: {
    color: '#cbd5e1',
    fontWeight: '700',
  },
  scoreValue: {
    color: '#4ade80',
    fontSize: 24,
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
    fontWeight: '800',
    color: '#0f172a',
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  errorCard: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  errorTitle: {
    color: '#b91c1c',
    fontWeight: '800',
  },
  errorText: {
    color: '#7f1d1d',
  },
  statLabel: {
    color: '#334155',
    fontWeight: '700',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chip: {
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    minWidth: 130,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  focusChip: {
    borderColor: '#0ea5e9',
    backgroundColor: '#e0f2fe',
  },
  chipHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  chipLabel: {
    fontWeight: '700',
    color: '#0f172a',
  },
  chipValue: {
    color: '#0f172a',
  },
  focusBadge: {
    backgroundColor: '#0ea5e9',
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  callout: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  calloutText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  meta: {
    color: '#64748b',
  },
  successText: {
    color: '#15803d',
    fontWeight: '700',
  },
  listItem: {
    color: '#0f172a',
  },
  focusHistory: {
    marginTop: 10,
    gap: 4,
  },
  previewCard: {
    backgroundColor: '#f8fafc',
  },
  previewTitle: {
    fontWeight: '800',
    color: '#0f172a',
  },
  blockTitle: {
    fontWeight: '800',
    color: '#0f172a',
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
    backgroundColor: '#f8fafc',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  linkButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  linkButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
});

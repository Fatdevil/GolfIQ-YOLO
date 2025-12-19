import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@app/api/client';
import {
  fetchAccessPlan,
  fetchPlayerAnalytics,
  fetchPlayerProfile,
  type AccessPlan,
  type PlayerAnalytics,
  type PlayerProfile,
} from '@app/api/player';
import WatchStatusCard from '@app/components/WatchStatusCard';
import type { RootStackParamList } from '@app/navigation/types';
import { navigateToStartRound } from '@app/navigation/startRound';
import { clearCurrentRun, loadCurrentRun, type CurrentRun } from '@app/run/currentRun';
import { loadLastRoundSummary, type LastRoundSummary } from '@app/run/lastRound';
import { t } from '@app/i18n';
import { loadLastRangeSessionSummary } from '@app/range/rangeSummaryStorage';
import type { RangeSessionSummary } from '@app/range/rangeSession';
import { logPracticeHomeCardViewed, logPracticeHomeCta } from '@app/analytics/practiceHome';
import {
  logRoundFlowV2ActiveRoundHydrateFailure,
  logRoundFlowV2ActiveRoundHydrateStart,
  logRoundFlowV2ActiveRoundHydrateSuccess,
  logRoundFlowV2FlagEvaluated,
  logRoundFlowV2HomeCardImpression,
  logRoundFlowV2HomeCtaBlockedLoading,
  logRoundFlowV2HomeCtaTap,
  logRoundHomeContinueClicked,
  logRoundHomeStartClicked,
  type RoundFlowV2ErrorType,
  type RoundFlowV2HydrateSource,
  type RoundFlowV2HomeCtaType,
  type RoundFlowV2Screen,
} from '@app/analytics/roundFlow';
import {
  getWeekStartISO,
  loadCurrentWeekPracticePlan,
  type PracticePlan,
} from '@app/practice/practicePlanStorage';
import { isPracticeGrowthV1Enabled } from '@shared/featureFlags/practiceGrowthV1';
import { logPracticeFeatureGated } from '@app/analytics/practiceFeatureGate';
import { fetchActiveRoundSummary, getCurrentRound, type ActiveRoundSummary, type RoundInfo } from '@app/api/roundClient';
import { getRoundFlowV2Reason, isRoundFlowV2Enabled, normalizeRoundFlowV2Reason } from '@shared/featureFlags/roundFlowV2';
import { loadActiveRoundState, saveActiveRoundState, type ActiveRoundState } from '@app/round/roundState';

type Props = NativeStackScreenProps<RootStackParamList, 'PlayerHome'>;

export type PlayerHomeState = {
  memberId: string;
  name: string;
  planLabel: string;
  isPro: boolean;
  plan: AccessPlan;
  lastRoundSummary?: LastRoundSummary | null;
};

function buildActiveRoundEntry(
  summary: ActiveRoundSummary | null,
  info: RoundInfo | null,
  fallback: ActiveRoundState | null,
): ActiveRoundState | null {
  const roundId = summary?.roundId ?? info?.id ?? fallback?.round.id;
  if (!roundId) return null;

  const round = {
    id: roundId,
    holes: info?.holes ?? summary?.holes ?? fallback?.round.holes ?? 18,
    courseId: info?.courseId ?? summary?.courseId ?? fallback?.round.courseId,
    courseName:
      info?.courseName ??
      summary?.courseName ??
      fallback?.round.courseName ??
      info?.courseId ??
      summary?.courseId ??
      'Course',
    teeName: info?.teeName ?? fallback?.round.teeName,
    startedAt: info?.startedAt ?? summary?.startedAt ?? fallback?.round.startedAt ?? new Date().toISOString(),
    startHole: info?.startHole ?? fallback?.round.startHole ?? 1,
    status: info?.status ?? 'in_progress',
  } as ActiveRoundState['round'];

  const currentHole = summary?.currentHole ?? info?.lastHole ?? fallback?.currentHole ?? round.startHole ?? 1;

  return { round, currentHole, preferences: fallback?.preferences };
}

function formatShortDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRelativeDate(value?: string | null): string {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return 'Recent';
  }
  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 6) return `${diffDays} days ago`;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function derivePlanLabel(plan: AccessPlan): string {
  if (plan.plan === 'pro') {
    if (plan.trial) {
      const until = formatShortDate(plan.expires_at);
      return until ? `Pro trial until ${until}` : 'Pro trial';
    }
    const until = formatShortDate(plan.expires_at);
    return until ? `Pro until ${until}` : 'Pro';
  }
  return 'Free';
}

function deriveName(profile: PlayerProfile): string {
  return (profile.name ?? '').trim() || profile.memberId || 'Player';
}

function deriveAnalyticsSummary(analytics?: PlayerAnalytics | null): LastRoundSummary | null {
  const lastPoint = analytics?.sgTrend?.[analytics.sgTrend.length - 1];
  if (!lastPoint) return null;
  return {
    courseName: lastPoint.runId ? `Round ${lastPoint.runId}` : 'Latest round',
    runId: lastPoint.runId ?? 'unknown',
    teeName: '',
    holes: 0,
    totalStrokes: 0,
    relativeToPar: `${lastPoint.sgTotal >= 0 ? '+' : ''}${lastPoint.sgTotal.toFixed(1)} SG`,
    finishedAt: lastPoint.date ?? new Date().toISOString(),
  };
}

function buildHomeState(
  profile: PlayerProfile,
  plan: AccessPlan,
  analytics?: PlayerAnalytics | null,
  lastRound?: LastRoundSummary | null,
): PlayerHomeState {
  return {
    memberId: profile.memberId,
    name: deriveName(profile),
    planLabel: derivePlanLabel(plan),
    isPro: plan.plan === 'pro',
    plan,
    lastRoundSummary: lastRound ?? deriveAnalyticsSummary(analytics),
  };
}

export default function HomeScreen({ navigation }: Props): JSX.Element {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    data: PlayerHomeState | null;
    currentRun: CurrentRun | null;
  }>({ loading: true, error: null, data: null, currentRun: null });
  const { loading, error, data, currentRun } = state;
  const [discardVisible, setDiscardVisible] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [lastRangeSession, setLastRangeSession] = useState<RangeSessionSummary | null>();
  const [practicePlanState, setPracticePlanState] = useState<{
    loading: boolean;
    plan: PracticePlan | null;
  }>({ loading: true, plan: null });
  const practiceCardLoggedRef = useRef(false);
  const practiceGrowthEnabled = isPracticeGrowthV1Enabled();
  const roundFlowV2Enabled = isRoundFlowV2Enabled();
  const roundFlowV2Reason = normalizeRoundFlowV2Reason(getRoundFlowV2Reason()) ?? 'unknown';
  const roundFlowV2Screen: RoundFlowV2Screen = 'Home';
  const [activeRound, setActiveRound] = useState<ActiveRoundState | null>(null);
  const [activeRoundError, setActiveRoundError] = useState<string | null>(null);
  const [activeRoundLoading, setActiveRoundLoading] = useState(false);
  const [activeRoundMeta, setActiveRoundMeta] = useState<{ hasCached: boolean; hasRemote: boolean }>({
    hasCached: false,
    hasRemote: false,
  });
  const roundFlowV2ImpressionLogged = useRef(false);
  const roundFlowV2EvaluationLogged = useRef(false);

  const gatePracticeGrowth = useCallback(
    (target: string) => {
      if (practiceGrowthEnabled) return false;

      logPracticeFeatureGated({ feature: 'practiceGrowthV1', target, source: 'home' });
      navigation.navigate('HomeDashboard');
      return true;
    },
    [navigation, practiceGrowthEnabled],
  );

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [profile, accessPlan, existingRun, lastRoundSummary] = await Promise.all([
        fetchPlayerProfile(),
        fetchAccessPlan(),
        loadCurrentRun(),
        loadLastRoundSummary(),
      ]);
      let analytics: PlayerAnalytics | null = null;
      if (accessPlan.plan === 'pro') {
        try {
          analytics = await fetchPlayerAnalytics();
        } catch (err) {
          // Analytics is pro-only; ignore 403 for now and allow the rest of the home shell to render.
          if (!(err instanceof ApiError && err.status === 403)) {
            throw err;
          }
        }
      }
      setState({
        loading: false,
        error: null,
        data: buildHomeState(profile, accessPlan, analytics, lastRoundSummary),
        currentRun: existingRun,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load home';
      setState({ loading: false, error: message, data: null, currentRun: null });
    }
  }, []);

  const handleDiscard = useCallback(async () => {
    if (!currentRun) return;
    setDiscarding(true);
    try {
      await clearCurrentRun();
      setState((prev) => ({ ...prev, currentRun: null }));
    } finally {
      setDiscarding(false);
      setDiscardVisible(false);
    }
  }, [currentRun]);

  useEffect(() => {
    load().catch(() => {
      /* handled in state */
    });
  }, [load]);

  useEffect(() => {
    if (roundFlowV2EvaluationLogged.current) return;
    roundFlowV2EvaluationLogged.current = true;
    logRoundFlowV2FlagEvaluated({ roundFlowV2Enabled, roundFlowV2Reason });
  }, [roundFlowV2Enabled, roundFlowV2Reason]);

  useEffect(() => {
    if (!roundFlowV2Enabled) return;

    let cancelled = false;

    async function hydrateActiveRound(): Promise<void> {
      const startTime = Date.now();
      let fetchError: unknown = null;
      setActiveRoundLoading(true);
      const cached = await loadActiveRoundState().catch(() => null);
      const hasCached = Boolean(cached?.round?.id);
      if (!cancelled && cached) {
        setActiveRound(cached);
      }

      try {
        logRoundFlowV2ActiveRoundHydrateStart({
          roundFlowV2Enabled,
          roundFlowV2Reason,
          screen: roundFlowV2Screen,
          source: hasCached ? 'cached' : 'none',
        });
        const [summary, info] = await Promise.all([
          fetchActiveRoundSummary().catch((err) => {
            console.warn('[home] Failed to load active round', err);
            fetchError = err;
            return null;
          }),
          getCurrentRound().catch(() => null),
        ]);

        if (cancelled) return;

        const hasRemote = Boolean(summary?.roundId || info?.id);
        setActiveRoundMeta({ hasCached, hasRemote });
        const derived = buildActiveRoundEntry(summary, info, cached);
        setActiveRound(derived);
        if (derived) {
          await saveActiveRoundState(derived);
        }
        const durationMs = Date.now() - startTime;
        const source: RoundFlowV2HydrateSource = hasCached && hasRemote
          ? 'mixed'
          : hasCached
            ? 'cached'
            : hasRemote
              ? 'remote'
              : 'none';
        if (fetchError) {
          const errorType: RoundFlowV2ErrorType =
            fetchError instanceof ApiError
              ? 'http'
              : fetchError instanceof TypeError
                ? 'network'
                : fetchError instanceof Error && /timeout/i.test(fetchError.message)
                  ? 'timeout'
                  : 'unknown';
          logRoundFlowV2ActiveRoundHydrateFailure({
            roundFlowV2Enabled,
            roundFlowV2Reason,
            screen: roundFlowV2Screen,
            source,
            durationMs,
            errorType,
          });
          setActiveRoundError(fetchError instanceof Error ? fetchError.message : 'Unable to load active round');
        } else {
          logRoundFlowV2ActiveRoundHydrateSuccess({
            roundFlowV2Enabled,
            roundFlowV2Reason,
            screen: roundFlowV2Screen,
            source,
            durationMs,
          });
          setActiveRoundError(null);
        }
      } finally {
        if (!cancelled) setActiveRoundLoading(false);
      }
    }

    hydrateActiveRound();

    return () => {
      cancelled = true;
    };
  }, [roundFlowV2Enabled, roundFlowV2Reason]);

  useEffect(() => {
    let cancelled = false;

    loadLastRangeSessionSummary()
      .then((summary) => {
        if (!cancelled) {
          setLastRangeSession(summary);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLastRangeSession(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    setPracticePlanState({ loading: true, plan: null });

    loadCurrentWeekPracticePlan()
      .then((plan) => {
        if (cancelled) return;
        const hasCurrentWeekPlan = plan?.weekStartISO === getWeekStartISO();
        setPracticePlanState({ loading: false, plan: hasCurrentWeekPlan ? plan : null });
      })
      .catch(() => {
        if (!cancelled) {
          setPracticePlanState({ loading: false, plan: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const lastRoundSummary = useMemo(() => {
    if (!data?.lastRoundSummary) return null;
    const dateLabel = formatRelativeDate(data.lastRoundSummary.finishedAt);
    const scoreLabel =
      data.lastRoundSummary.relativeToPar ?? `${data.lastRoundSummary.totalStrokes} strokes`;
    return { ...data.lastRoundSummary, dateLabel, scoreLabel };
  }, [data?.lastRoundSummary]);

  const lastRangeLabel = useMemo(() => {
    if (!lastRangeSession) return null;
    const club = lastRangeSession.club?.trim() || null;
    const shots = Number.isFinite(lastRangeSession.shotCount) ? lastRangeSession.shotCount : null;

    if (club && shots !== null) {
      return t('home.range.lastSession.label', { club, shots });
    }
    if (!club && shots !== null) {
      return t('home.range.lastSession.label_no_club', { shots });
    }
    if (club) {
      return t('home.range.lastSession.label_club_only', { club });
    }

    return t('home.range.lastSession.label_club_only', {
      club: t('home.range.lastSession.anyClub'),
    });
  }, [lastRangeSession]);

  const practiceProgress = useMemo(() => {
    const plan = practicePlanState.plan;
    if (!plan || !plan.items.length) return null;

    const total = plan.items.length;
    const completed = plan.items.filter((item) => {
      return item.status === 'done' || Boolean((item as any).completedAt);
    }).length;

    return { total, completed };
  }, [practicePlanState.plan]);

  useEffect(() => {
    if (!practiceGrowthEnabled || practicePlanState.loading || practiceCardLoggedRef.current) return;

    practiceCardLoggedRef.current = true;
    logPracticeHomeCardViewed({
      hasPlan: Boolean(practicePlanState.plan && practicePlanState.plan.items.length),
      totalDrills: practiceProgress?.total,
      completedDrills: practiceProgress?.completed,
    });
  }, [practiceGrowthEnabled, practicePlanState.loading, practicePlanState.plan, practiceProgress]);

  const hasPracticePlan = Boolean(practicePlanState.plan && practicePlanState.plan.items.length);

  const practicePrimaryCtaLabel = practiceProgress && practiceProgress.completed > 0
    ? t('home.practice.cta_continue')
    : t('home.practice.cta_start');

  const buildRoundFlowV2HomeTelemetry = useCallback(
    (ctaType: RoundFlowV2HomeCtaType) => ({
      roundFlowV2Enabled,
      roundFlowV2Reason,
      screen: roundFlowV2Screen,
      ctaType,
      activeRoundLoading,
      hasActiveRoundCached: activeRoundMeta.hasCached,
      hasActiveRoundRemote: activeRoundMeta.hasRemote,
    }),
    [
      activeRoundLoading,
      activeRoundMeta.hasCached,
      activeRoundMeta.hasRemote,
      roundFlowV2Enabled,
      roundFlowV2Reason,
      roundFlowV2Screen,
    ],
  );

  useEffect(() => {
    if (!roundFlowV2Enabled || roundFlowV2ImpressionLogged.current || loading) return;
    roundFlowV2ImpressionLogged.current = true;
    logRoundFlowV2HomeCardImpression(buildRoundFlowV2HomeTelemetry(activeRound ? 'continue' : 'start'));
  }, [activeRound, buildRoundFlowV2HomeTelemetry, loading, roundFlowV2Enabled]);

  const loadingAccessibilityState: Record<string, unknown> = activeRoundLoading
    ? { accessibilityState: { disabled: true, busy: true } }
    : {};

  const activeRoundSubtitle = useMemo(() => {
    if (!activeRound?.round) return null;
    const courseLabel = activeRound.round.courseName?.trim() || activeRound.round.courseId || 'Course';
    const holesLabel = activeRound.round.holes ? `${activeRound.round.holes} holes` : null;
    const holeProgress = activeRound.currentHole ? `Hole ${activeRound.currentHole}` : null;
    return [courseLabel, holesLabel, holeProgress].filter(Boolean).join(' · ');
  }, [activeRound]);

  const handlePracticeStart = useCallback(() => {
    if (gatePracticeGrowth('PracticeSession')) return;

    logPracticeHomeCta('start');
    navigation.navigate('PracticeSession');
  }, [gatePracticeGrowth, navigation]);

  const handlePracticeViewPlan = useCallback(() => {
    if (gatePracticeGrowth('PracticePlanner')) return;

    logPracticeHomeCta('view_plan');
    navigation.navigate('PracticePlanner');
  }, [gatePracticeGrowth, navigation]);

  const handlePracticeBuildPlan = useCallback(() => {
    if (gatePracticeGrowth('PracticeWeeklySummary')) return;

    logPracticeHomeCta('build_plan');
    navigation.navigate('WeeklySummary');
  }, [gatePracticeGrowth, navigation]);

  const handleRoundV2Start = useCallback(() => {
    if (activeRoundLoading) {
      logRoundFlowV2HomeCtaBlockedLoading(buildRoundFlowV2HomeTelemetry('start'));
      return;
    }
    logRoundFlowV2HomeCtaTap(buildRoundFlowV2HomeTelemetry('start'));
    logRoundHomeStartClicked();
    navigateToStartRound(navigation, 'home');
  }, [activeRoundLoading, buildRoundFlowV2HomeTelemetry, navigation]);

  const handleRoundV2Continue = useCallback(async () => {
    if (activeRoundLoading) {
      logRoundFlowV2HomeCtaBlockedLoading(buildRoundFlowV2HomeTelemetry('continue'));
      return;
    }
    if (!activeRound?.round?.id) return;
    logRoundFlowV2HomeCtaTap(buildRoundFlowV2HomeTelemetry('continue'));
    logRoundHomeContinueClicked(activeRound.round.id);

    try {
      await saveActiveRoundState(activeRound);
    } catch {
      // best-effort cache for quick resume
    }

    navigation.navigate('RoundShot', { roundId: activeRound.round.id });
  }, [activeRound, activeRoundLoading, buildRoundFlowV2HomeTelemetry, navigation]);

  const handlePracticeHistory = useCallback(() => {
    if (gatePracticeGrowth('PracticeJournal')) return;

    navigation.navigate('PracticeJournal');
  }, [gatePracticeGrowth, navigation]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator testID="home-loading" />
        <Text style={styles.loadingText}>Loading your GolfIQ…</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText} testID="home-error">
          {error ?? 'Something went wrong'}
        </Text>
        <TouchableOpacity onPress={() => load().catch(() => {})} testID="home-retry">
          <View style={styles.button}>
            <Text style={styles.buttonText}>Try again</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting} testID="home-greeting">
          Hi, {data.name} 👋
        </Text>
        <View style={styles.planBadge} testID="plan-badge">
          <Text style={styles.planBadgeText}>{data.planLabel}</Text>
        </View>
      </View>

      {roundFlowV2Enabled ? (
        <View style={styles.card} testID={activeRound ? 'continue-round-card' : 'start-round-card'}>
          <Text style={styles.cardTitle}>{activeRound ? 'Continue round' : 'Start round'}</Text>
          <Text style={styles.cardSubtitle}>
            {activeRound
              ? activeRoundSubtitle || 'Resume your on-course round.'
              : 'Start a new round with GPS, scoring, and caddie tools.'}
          </Text>
          {activeRoundError ? <Text style={styles.cardFootnote}>{activeRoundError}</Text> : null}
          {activeRoundLoading && !activeRound ? (
            <View style={styles.row}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.cardSubtitle}>Checking for active rounds…</Text>
            </View>
          ) : null}
          <TouchableOpacity
            accessibilityLabel={activeRoundLoading ? 'Checking round' : activeRound ? 'Continue round' : 'Start round'}
            {...loadingAccessibilityState}
            onPress={activeRound ? handleRoundV2Continue : handleRoundV2Start}
            testID={activeRound ? 'continue-round' : 'start-round-v2'}
          >
            <View style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>
                {activeRoundLoading ? 'Checking round…' : activeRound ? 'Continue' : 'Start round'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      {!roundFlowV2Enabled && currentRun && (
        <View style={styles.card} testID="resume-round-card">
          <Text style={styles.cardTitle}>Pågående runda</Text>
          <Text style={styles.cardSubtitle}>
            {currentRun.courseName} · {currentRun.teeName} · Hål {currentRun.currentHole} av {currentRun.holes}
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              accessibilityLabel="Återuppta runda"
              onPress={() => navigation.navigate('PlayInRound')}
              testID="resume-round"
            >
              <View style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Återuppta runda</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Avsluta utan att spara"
              onPress={() => setDiscardVisible(true)}
              testID="discard-round"
            >
              <View style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Avsluta utan att spara</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!roundFlowV2Enabled ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ready to play?</Text>
          <Text style={styles.cardSubtitle}>Start a new round with GPS, scoring, and caddie tools.</Text>
          <TouchableOpacity
            accessibilityLabel="Play round"
            onPress={() => navigation.navigate('PlayCourseSelect')}
            testID="play-round-cta"
          >
            <View style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Play round</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="Start on-course logging"
            onPress={() => navigateToStartRound(navigation, 'home')}
            testID="round-engine-start"
          >
            <View style={[styles.secondaryButton, { marginTop: 8 }]}>
              <Text style={styles.secondaryButtonText}>Log shots on course</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.card} testID="range-home-card">
        <Text style={styles.cardTitle}>{t('home.range.title')}</Text>
        <Text style={styles.cardSubtitle}>{t('home.range.subtitle')}</Text>
        <Text style={styles.cardDetail} testID="range-last-session-label">
          {lastRangeLabel ?? t('home.range.lastSession.none')}
        </Text>
        <TouchableOpacity
          accessibilityLabel={t('home.range.cta')}
          onPress={() => navigation.navigate('RangePractice')}
          testID="range-home-cta"
        >
          <View style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{t('home.range.cta')}</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.cardFootnote}>{t('home.range.missionsTeaser')}</Text>
      </View>

      {practiceGrowthEnabled ? (
        <View style={styles.card} testID="practice-home-card">
          <Text style={styles.cardTitle}>{t('home.practice.title')}</Text>
          {practicePlanState.loading ? (
            <View style={styles.row}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.cardSubtitle}>{t('home.practice.loading')}</Text>
            </View>
          ) : hasPracticePlan && practiceProgress ? (
            <>
              <Text style={styles.cardSubtitle} testID="practice-home-progress">
                {t('home.practice.progress', {
                  done: practiceProgress.completed,
                  total: practiceProgress.total,
                })}
              </Text>
              <TouchableOpacity
                accessibilityLabel={practicePrimaryCtaLabel}
                onPress={handlePracticeStart}
                testID="practice-home-start"
              >
                <View style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>{practicePrimaryCtaLabel}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel={t('home.practice.cta_view_plan')}
                onPress={handlePracticeViewPlan}
                testID="practice-home-view-plan"
              >
                <View style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>{t('home.practice.cta_view_plan')}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePracticeHistory} testID="practice-home-history">
                <View style={styles.linkButton}>
                  <Text style={styles.linkText}>{t('practice.journal.view_history')}</Text>
                </View>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.cardSubtitle} testID="practice-home-empty">
                {t('home.practice.empty')}
              </Text>
              <TouchableOpacity
                accessibilityLabel={t('home.practice.cta_build')}
                onPress={handlePracticeBuildPlan}
                testID="practice-home-build"
              >
                <View style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>{t('home.practice.cta_build')}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityLabel={t('home.practice.cta_view_plan')}
                onPress={handlePracticeViewPlan}
                testID="practice-home-view-plan"
              >
                <View style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>{t('home.practice.cta_view_plan')}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePracticeHistory} testID="practice-home-history">
                <View style={styles.linkButton}>
                  <Text style={styles.linkText}>{t('practice.journal.view_history')}</Text>
                </View>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : null}

      {practiceGrowthEnabled ? (
        <View style={styles.card} testID="practice-planner-card">
          <Text style={styles.cardTitle}>{t('practice_planner_title')}</Text>
          <Text style={styles.cardSubtitle}>{t('practice_planner_subtitle')}</Text>
          <TouchableOpacity
            accessibilityLabel={t('practice_planner_title')}
            onPress={() => navigation.navigate('PracticePlanner')}
            testID="practice-planner-cta"
          >
            <View style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('practice_planner_browse_all')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.card} testID="rounds-stats-card">
        <Text style={styles.cardTitle}>{t('round.history.title')}</Text>
        <Text style={styles.cardSubtitle}>{t('stats.player.subtitle')}</Text>
        <View style={styles.row}>
          <TouchableOpacity
            onPress={() => navigation.navigate('RoundHistory')}
            accessibilityLabel={t('round.history.view_round')}
            testID="round-history-cta"
          >
            <View style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{t('round.history.title')}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('PlayerStats')}
            accessibilityLabel={t('stats.player.title')}
            testID="player-stats-cta"
          >
            <View style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{t('stats.player.title')}</Text>
            </View>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('WeeklySummary')}
          accessibilityLabel={t('weeklySummary.title')}
          testID="weekly-summary-cta"
        >
          <View style={[styles.secondaryButton, { marginTop: 8 }]}>
            <Text style={styles.secondaryButtonText}>{t('weeklySummary.title')}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <WatchStatusCard memberId={data.memberId} plan={data.plan} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Explore</Text>
        <View style={styles.row}>
          <TouchableOpacity
            onPress={() => navigation.navigate('RangePractice')}
            accessibilityLabel="Range practice"
            testID="range-cta"
          >
            <View style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Range practice</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Trips')}
            accessibilityLabel="Trips"
            testID="trips-cta"
          >
            <View style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Trips & buddies</Text>
            </View>
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          <TouchableOpacity
            onPress={() => navigation.navigate('ClubDistances')}
            accessibilityLabel={t('clubDistances.title')}
            testID="club-distances-cta"
          >
            <View style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{t('clubDistances.title')}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('CaddieApproach')}
            accessibilityLabel={t('caddie.decision.screen_title')}
            testID="caddie-approach-cta"
          >
            <View style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{t('caddie.decision.screen_title')}</Text>
            </View>
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          <TouchableOpacity
            onPress={() => navigation.navigate('CaddieSetup')}
            accessibilityLabel={t('caddie.setup.title')}
            testID="caddie-setup-cta"
          >
            <View style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{t('caddie.setup.title')}</Text>
              <Text style={styles.secondaryButtonSubtext}>{t('caddie.setup.subtitle')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Last round</Text>
          {data.isPro && <Text style={styles.proPill}>Pro</Text>}
        </View>
        {lastRoundSummary ? (
          <View style={styles.summary} testID="last-round-summary">
            <Text style={styles.summaryTitle}>{lastRoundSummary.courseName}</Text>
            <Text style={styles.summaryScore}>{lastRoundSummary.scoreLabel}</Text>
            <Text style={styles.summaryDate}>{lastRoundSummary.dateLabel}</Text>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('RoundStory', {
                  runId: data.lastRoundSummary!.runId,
                  summary: data.lastRoundSummary!,
                })
              }
              testID="view-last-round"
            >
              <View style={styles.linkButton}>
                <Text style={styles.linkText}>View details</Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.emptySummary} testID="empty-last-round">
            No rounds logged yet. Head out and play your first round!
          </Text>
        )}
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={discardVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Avsluta runda?</Text>
            <Text style={styles.modalSubtitle}>
              Vill du verkligen avsluta denna runda? Den kommer inte att räknas in i din statistik.
            </Text>
            <View style={styles.row}>
              <TouchableOpacity onPress={() => setDiscardVisible(false)} testID="cancel-discard">
                <View style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Behåll runda</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDiscard().catch(() => {})} testID="confirm-discard">
                <View style={styles.dangerButton}>
                  <Text style={styles.dangerButtonText}>
                    {discarding ? 'Avbryter…' : 'Avsluta utan att spara'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 8,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  planBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eef2ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  planBadgeText: {
    color: '#4338ca',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: '#e5e7eb',
    fontSize: 14,
  },
  cardDetail: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  cardFootnote: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  primaryButton: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 16,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#111827',
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    fontWeight: '600',
    color: '#111827',
  },
  secondaryButtonSubtext: {
    color: '#4b5563',
    fontSize: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  proPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#fef08a',
    color: '#854d0e',
    fontWeight: '700',
  },
  summary: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 10,
    gap: 4,
  },
  summaryTitle: {
    fontWeight: '700',
    color: '#0f172a',
    fontSize: 16,
  },
  summaryScore: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '700',
  },
  summaryDate: {
    color: '#6b7280',
    fontSize: 12,
  },
  linkButton: {
    marginTop: 8,
    paddingVertical: 8,
  },
  linkText: {
    color: '#1d4ed8',
    fontWeight: '700',
  },
  emptySummary: {
    color: '#6b7280',
    fontSize: 14,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#111827',
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  loadingText: {
    color: '#374151',
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '700',
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    gap: 12,
    width: '100%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalSubtitle: {
    color: '#374151',
    fontSize: 14,
  },
  dangerButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#ef4444',
  },
  dangerButtonText: {
    fontWeight: '700',
    color: '#fff',
  },
});

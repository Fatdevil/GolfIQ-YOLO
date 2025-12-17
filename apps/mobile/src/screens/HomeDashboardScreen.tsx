import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { fetchPlayerBag, type PlayerBag } from '@app/api/bagClient';
import { fetchBagStats } from '@app/api/bagStatsClient';
import {
  fetchCurrentRound,
  fetchLatestCompletedRound,
  fetchRoundRecap,
  startRound,
  type RoundInfo,
  type RoundSummaryWithRoundInfo,
} from '@app/api/roundClient';
import { fetchPracticePlan, type PracticePlan } from '@app/api/practiceClient';
import { fetchPlayerProfile, type PlayerProfile } from '@app/api/player';
import { fetchWeeklySummary, type WeeklySummary } from '@app/api/weeklySummaryClient';
import { fetchCourseLayout, fetchCourses } from '@app/api/courseClient';
import { t } from '@app/i18n';
import type { RootStackParamList } from '@app/navigation/types';
import { loadEngagementState, saveEngagementState, type EngagementState } from '@app/storage/engagement';
import {
  PRACTICE_MISSION_WINDOW_DAYS,
  loadPracticeMissionHistory,
  summarizeRecentPracticeHistory,
  type PracticeProgressOverview,
} from '@app/storage/practiceMissionHistory';
import { loadWeeklyPracticeGoalSettings } from '@app/storage/practiceGoalSettings';
import { safeEmit } from '@app/telemetry';
import { useTrackOncePerKey } from '@app/hooks/useTrackOncePerKey';
import { buildMissionProgressById, type PracticeMissionHistoryEntry } from '@shared/practice/practiceHistory';
import {
  buildSgLightPracticeCtaClickTelemetry,
  buildSgLightPracticeFocusEntryImpressionDedupeKey,
  buildSgLightPracticeFocusEntryShownTelemetry,
} from '@shared/sgLight/analytics';
import { useGeolocation } from '@app/hooks/useGeolocation';
import { saveActiveRoundState } from '@app/round/roundState';
import { computeNearestCourse } from '@shared/round/autoHoleCore';
import { buildQuickStartPlan } from '@app/utils/quickStartRound';
import { buildBagReadinessOverview } from '@shared/caddie/bagReadiness';
import type { BagClubStatsMap } from '@shared/caddie/bagStats';
import type { BagSuggestion } from '@shared/caddie/bagTuningSuggestions';
import { formatDistance } from '@app/utils/distance';
import { buildPracticeProgressTileModel } from '@app/home/practiceProgressHelpers';
import { getTopPracticeRecommendation, type BagPracticeRecommendation } from '@shared/caddie/bagPracticeRecommendations';
import {
  buildWeeklyGoalStreak,
  buildWeeklyPracticeGoalProgress,
  type PracticeGoalStatus,
} from '@shared/practice/practiceGoals';
import { shouldShowWeeklyGoalNudge } from '@shared/practice/practiceGoalNudge';
import {
  buildPracticeMissionsList,
  type PracticeMissionDefinition,
  type PracticeMissionListItem,
} from '@shared/practice/practiceMissionsList';
import { buildWeeklyPracticePlanHomeSummary } from '@shared/practice/practicePlan';
import { getDefaultWeeklyPracticeGoalSettings } from '@shared/practice/practiceGoalSettings';
import { buildPracticeReadinessSummary } from '@shared/practice/practiceReadiness';
import { buildPracticeDecisionContext } from '@shared/practice/practiceDecisionContext';
import {
  trackPracticeGoalNudgeClicked,
  trackPracticeGoalNudgeShown,
} from '@shared/practice/practiceGoalAnalytics';
import { recommendPracticeMissions, type RecommendedMission } from '@shared/practice/recommendPracticeMissions';
import {
  emitPracticeMissionRecommendationClicked,
  emitPracticeMissionRecommendationShown,
  type PracticeRecommendationContext,
} from '@shared/practice/practiceRecommendationsAnalytics';
import { emitPracticeMissionStart } from '@shared/practice/practiceSessionAnalytics';
import { getExperimentBucket, getExperimentVariant, getPracticeRecommendationsExperiment, isInExperiment } from '@shared/experiments/flags';
import {
  findLatestStrokesGainedLightFocus,
  type StrokesGainedLightFocusInsight,
} from '@shared/stats/strokesGainedLightFocus';

const CALIBRATION_SAMPLE_THRESHOLD = 5;
const TARGET_ROUNDS_PER_WEEK = 3;

type Props = NativeStackScreenProps<RootStackParamList, 'HomeDashboard'>;

type DashboardState = {
  loading: boolean;
  profile: PlayerProfile | null;
  currentRound: RoundInfo | null;
  latestRound: RoundSummaryWithRoundInfo | null;
  weeklySummary: WeeklySummary | null;
  practicePlan: PracticePlan | null;
  bag: PlayerBag | null;
  bagStats: BagClubStatsMap | null;
  engagement: EngagementState | null;
};

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatToPar(toPar?: number | null): string | null {
  if (toPar === null || toPar === undefined) return null;
  if (toPar === 0) return 'E';
  return `${toPar > 0 ? '+' : ''}${toPar}`;
}

function deriveGreeting(profile: PlayerProfile | null): string {
  const raw = profile?.name?.trim();
  if (!raw) return t('home_dashboard_title');
  const [first] = raw.split(' ');
  return t('home_dashboard_greeting', { name: first || raw });
}

function summarizeBag(bag: PlayerBag | null): { calibrated: number; needsMore: number; total: number } {
  if (!bag) return { calibrated: 0, needsMore: 0, total: 0 };
  const calibrated = bag.clubs.filter((club) => club.sampleCount >= CALIBRATION_SAMPLE_THRESHOLD).length;
  const needsMore = Math.max(bag.clubs.length - calibrated, 0);
  return { calibrated, needsMore, total: bag.clubs.length };
}

function formatBagSuggestion(
  suggestion: BagSuggestion,
  clubLabels: Record<string, string>,
): string | null {
  const lower = suggestion.lowerClubId ? clubLabels[suggestion.lowerClubId] ?? suggestion.lowerClubId : null;
  const upper = suggestion.upperClubId ? clubLabels[suggestion.upperClubId] ?? suggestion.upperClubId : null;
  const clubLabel = suggestion.clubId ? clubLabels[suggestion.clubId] ?? suggestion.clubId : null;
  const distanceLabel =
    suggestion.gapDistance != null ? formatDistance(suggestion.gapDistance, { withUnit: true }) : null;

  if (suggestion.type === 'fill_gap' && lower && upper && distanceLabel) {
    return t('bag.suggestions.fill_gap', { lower, upper, distance: distanceLabel });
  }

  if (suggestion.type === 'reduce_overlap' && lower && upper) {
    return t('bag.suggestions.reduce_overlap', { lower, upper, distance: distanceLabel });
  }

  if (suggestion.type === 'calibrate' && clubLabel) {
    return t(
      suggestion.severity === 'high'
        ? 'bag.suggestions.calibrate.no_data'
        : 'bag.suggestions.calibrate.needs_more_samples',
      { club: clubLabel },
    );
  }

  return null;
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
  bagReadiness: ReturnType<typeof buildBagReadinessOverview> | null,
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

export default function HomeDashboardScreen({ navigation }: Props): JSX.Element {
  const [state, setState] = useState<DashboardState>({
    loading: true,
    profile: null,
    currentRound: null,
    latestRound: null,
    weeklySummary: null,
    practicePlan: null,
    bag: null,
    bagStats: null,
    engagement: null,
  });
  const [sharingWeekly, setSharingWeekly] = useState(false);
  const [quickStarting, setQuickStarting] = useState(false);
  const [practiceOverview, setPracticeOverview] = useState<PracticeProgressOverview | null>(null);
  const [practiceHistory, setPracticeHistory] = useState<PracticeMissionHistoryEntry[]>([]);
  const [weeklyGoalSettings, setWeeklyGoalSettings] = useState(
    getDefaultWeeklyPracticeGoalSettings(),
  );
  const [sgLightFocus, setSgLightFocus] = useState<StrokesGainedLightFocusInsight | null>(null);
  const planCompletedViewedRef = useRef(false);
  const goalNudgeShownRef = useRef<string | null>(null);
  const practiceRecommendationImpressionsRef = useRef(new Set<string>());
  const geo = useGeolocation();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [profileRes, currentRoundRes, latestRoundRes, weeklyRes, practiceRes, bagRes, bagStatsRes, engagementRes] =
        await Promise.allSettled([
          fetchPlayerProfile(),
          fetchCurrentRound(),
          fetchLatestCompletedRound(),
          fetchWeeklySummary(),
          fetchPracticePlan({ maxMinutes: 30 }),
          fetchPlayerBag(),
          fetchBagStats(),
          loadEngagementState(),
        ]);

      if (cancelled) return;
      const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
      const currentRound = currentRoundRes.status === 'fulfilled' ? currentRoundRes.value : null;
      const latestRound = latestRoundRes.status === 'fulfilled' ? latestRoundRes.value : null;
      const weeklySummary = weeklyRes.status === 'fulfilled' ? weeklyRes.value : null;
      const practicePlan = practiceRes.status === 'fulfilled' ? practiceRes.value : null;
      const bag = bagRes.status === 'fulfilled' ? bagRes.value : null;
      const engagement = engagementRes.status === 'fulfilled' ? engagementRes.value : null;
      const bagStats = bagStatsRes.status === 'fulfilled' ? bagStatsRes.value : null;

      if (profileRes.status === 'rejected') console.warn('Home dashboard profile load failed', profileRes.reason);
      if (currentRoundRes.status === 'rejected')
        console.warn('Home dashboard current round load failed', currentRoundRes.reason);
      if (latestRoundRes.status === 'rejected')
        console.warn('Home dashboard latest round load failed', latestRoundRes.reason);
      if (weeklyRes.status === 'rejected') console.warn('Home dashboard weekly load failed', weeklyRes.reason);
      if (practiceRes.status === 'rejected') console.warn('Home dashboard practice load failed', practiceRes.reason);
      if (bagRes.status === 'rejected') console.warn('Home dashboard bag load failed', bagRes.reason);
      if (bagStatsRes.status === 'rejected') console.warn('Home dashboard bag stats load failed', bagStatsRes.reason);
      if (engagementRes.status === 'rejected')
        console.warn('Home dashboard engagement load failed', engagementRes.reason);

      setState({
        loading: false,
        profile,
        currentRound,
        latestRound,
        weeklySummary,
        practicePlan,
        bag,
        bagStats,
        engagement,
      });
    };

    load().catch((err) => console.warn('Home dashboard load crashed', err));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPracticeHistory = async () => {
      try {
        const [history, settings] = await Promise.all([
          loadPracticeMissionHistory(),
          loadWeeklyPracticeGoalSettings().catch((err) => {
            console.warn('[home] Failed to load weekly goal settings', err);
            return getDefaultWeeklyPracticeGoalSettings();
          }),
        ]);
        if (cancelled) return;
        setPracticeOverview(summarizeRecentPracticeHistory(history, new Date()));
        setPracticeHistory(history);
        setWeeklyGoalSettings(settings ?? getDefaultWeeklyPracticeGoalSettings());
      } catch (err) {
        if (!cancelled) {
          console.warn('Home dashboard practice history load failed', err);
          setPracticeOverview({
            totalSessions: 0,
            completedSessions: 0,
            windowDays: PRACTICE_MISSION_WINDOW_DAYS,
          });
          setPracticeHistory([]);
          setWeeklyGoalSettings(getDefaultWeeklyPracticeGoalSettings());
        }
      }
    };

    loadPracticeHistory().catch((err) => console.warn('Home dashboard practice history crashed', err));

    return () => {
      cancelled = true;
    };
  }, []);

  const { loading, profile, currentRound, latestRound, weeklySummary, practicePlan, bag, bagStats, engagement } = state;
  const telemetryClient = useMemo(() => ({ emit: safeEmit }), []);

  const userIdForExperiments = profile?.memberId ?? 'anonymous';

  const practiceProgressModel = useMemo(
    () => buildPracticeProgressTileModel(practiceOverview),
    [practiceOverview],
  );

  const practiceGoalNow = new Date(Date.now());
  const practiceGoalProgress = useMemo(
    () =>
      buildWeeklyPracticeGoalProgress({
        missionHistory: practiceHistory,
        now: practiceGoalNow,
        targetMissionsPerWeek: weeklyGoalSettings.targetMissionsPerWeek,
      }),
    [practiceHistory, practiceGoalNow, weeklyGoalSettings.targetMissionsPerWeek],
  );

  const weeklyGoalNudge = useMemo(
    () => shouldShowWeeklyGoalNudge(practiceHistory, weeklyGoalSettings, practiceGoalNow),
    [practiceGoalNow, practiceHistory, weeklyGoalSettings],
  );

  const practiceGoalStreak = useMemo(
    () =>
      buildWeeklyGoalStreak({
        history: practiceHistory,
        now: practiceGoalNow,
        settings: weeklyGoalSettings,
      }),
    [practiceGoalNow, practiceHistory, weeklyGoalSettings],
  );

  const experimentBucket = useMemo(
    () => getExperimentBucket('weekly_goal_nudge', userIdForExperiments),
    [userIdForExperiments],
  );

  const experimentVariant = useMemo(
    () => getExperimentVariant('weekly_goal_nudge', userIdForExperiments),
    [userIdForExperiments],
  );

  const practiceFocusEntryTelemetry = useMemo(() => {
    if (!sgLightFocus) return null;
    return buildSgLightPracticeFocusEntryShownTelemetry({
      surface: 'mobile_home_sg_light_focus',
      focusCategory: sgLightFocus.focusCategory,
    });
  }, [sgLightFocus]);

  const practiceFocusEntryDedupeKey = useMemo(() => {
    if (!sgLightFocus) return null;
    return buildSgLightPracticeFocusEntryImpressionDedupeKey({
      surface: 'mobile_home_sg_light_focus',
      missionId: 'sg_light_focus',
      entryPoint: 'sg_light_focus_card',
      focusArea: sgLightFocus.focusCategory,
    });
  }, [sgLightFocus]);

  const { fire: trackPracticeFocusEntryOnce } = useTrackOncePerKey(
    practiceFocusEntryDedupeKey,
  );

  const shouldRenderWeeklyGoalNudge = useMemo(
    () => isInExperiment('weekly_goal_nudge', userIdForExperiments) && weeklyGoalNudge.shouldShow,
    [userIdForExperiments, weeklyGoalNudge.shouldShow],
  );

  const practiceGoalStreakLabel = useMemo(() => {
    const streakWeeks = practiceGoalStreak.currentStreakWeeks;
    if (streakWeeks < 2) return null;
    return t('practice_goal_streak_label', { count: streakWeeks });
  }, [practiceGoalStreak.currentStreakWeeks, t]);

  useEffect(() => {
    if (!practiceFocusEntryTelemetry) return;

    trackPracticeFocusEntryOnce(() => {
      safeEmit(
        practiceFocusEntryTelemetry.eventName,
        practiceFocusEntryTelemetry.payload,
      );
    });
  }, [practiceFocusEntryTelemetry, trackPracticeFocusEntryOnce]);

  const practiceGoalCopy = useMemo(() => {
    const summary = practiceGoalProgress
      ? t('practice.goals.summary', {
          completed: practiceGoalProgress.completedInWindow,
          target: practiceGoalProgress.targetCompletions,
        })
      : null;

    const status: PracticeGoalStatus | null = practiceGoalProgress?.status ?? null;

    if (!practiceGoalProgress) return { summary: null, statusLabel: null };

    if (status === 'not_started') {
      return { summary: t('practice.goals.emptyPrompt'), statusLabel: null };
    }

    if (status === 'goal_reached') {
      return { summary, statusLabel: t('practice.goal.status.goal_reached_title') };
    }

    if (status === 'exceeded') {
      return { summary, statusLabel: t('practice.goal.status.exceeded_title') };
    }

    return {
      summary,
      statusLabel: t('practice.goals.status.catchUp'),
    };
  }, [practiceGoalProgress]);

  const weeklyGoalNudgeCopy = useMemo(() => {
    if (!shouldRenderWeeklyGoalNudge) return null;
    if (weeklyGoalNudge.remainingMissions <= 1) {
      return "One session left to hit this week's practice goal";
    }
    const percent = Math.round(weeklyGoalNudge.completionPercent * 100);
    return `You're ${percent}% to your weekly goal – finish strong!`;
  }, [shouldRenderWeeklyGoalNudge, weeklyGoalNudge.completionPercent, weeklyGoalNudge.remainingMissions]);

  const clubLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    bag?.clubs.forEach((club) => {
      labels[club.clubId] = club.label;
    });
    return labels;
  }, [bag?.clubs]);

  const bagReadinessOverview = useMemo(() => {
    if (!bag || !bag.clubs?.length) return null;
    return buildBagReadinessOverview(bag, bagStats ?? {});
  }, [bag, bagStats]);

  const practiceMissions = useMemo<PracticeMissionListItem[]>(() => {
    const missions = buildMissionDefinitions(bagReadinessOverview, practiceHistory);
    if (missions.length === 0) return [];

    const missionProgressById = buildMissionProgressById(
      practiceHistory,
      missions.map((mission) => mission.id),
      { windowDays: PRACTICE_MISSION_WINDOW_DAYS, now: practiceGoalNow },
    );

    return buildPracticeMissionsList({
      bagReadiness: bagReadinessOverview,
      missionProgressById,
      missions,
    });
  }, [bagReadinessOverview, practiceGoalNow, practiceHistory]);

  const practiceReadinessSummary = useMemo(
    () => buildPracticeReadinessSummary({ history: practiceHistory, goalSettings: weeklyGoalSettings }),
    [practiceHistory, weeklyGoalSettings],
  );

  const practiceDecisionContext = useMemo(
    () => buildPracticeDecisionContext({ summary: practiceReadinessSummary, source: 'home' }),
    [practiceReadinessSummary],
  );

  const practiceRecommendationsExperiment = useMemo(
    () => getPracticeRecommendationsExperiment(userIdForExperiments),
    [userIdForExperiments],
  );

  const practiceRecommendationsSuppressed =
    practiceRecommendationsExperiment.experimentVariant === 'disabled' ||
    !practiceRecommendationsExperiment.enabled;

  useEffect(() => {
    let cancelled = false;

    if (practiceRecommendationsSuppressed || !latestRound) {
      setSgLightFocus(null);
      return;
    }

    fetchRoundRecap(latestRound.roundId)
      .then((recap) => {
        if (cancelled) return;
        const focus = findLatestStrokesGainedLightFocus([
          {
            roundId: recap.roundId,
            finishedAt: latestRound.endedAt ?? recap.date,
            strokesGainedLight: recap.strokesGainedLight ?? null,
          },
        ]);
        setSgLightFocus(focus);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Home dashboard SG Light focus load failed', err);
          setSgLightFocus(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [latestRound, practiceRecommendationsSuppressed]);

  const practiceRecommendations = useMemo(
    () =>
      loading || practiceRecommendationsSuppressed
        ? []
        : recommendPracticeMissions({
            context: practiceDecisionContext,
            missions: practiceMissions.map((mission) => ({
              id: mission.id,
              focusArea: (mission as any).focusArea,
              priorityScore: mission.priorityScore,
              estimatedMinutes: (mission as any).estimatedMinutes,
              difficulty: (mission as any).difficulty,
              completionCount: mission.completionCount,
              lastCompletedAt: mission.lastCompletedAt,
            })),
            experimentVariant: practiceRecommendationsExperiment.experimentVariant,
          }),
    [
      loading,
      practiceDecisionContext,
      practiceMissions,
      practiceRecommendationsExperiment.experimentVariant,
      practiceRecommendationsSuppressed,
    ],
  );

  const homePracticeRecommendation = useMemo<RecommendedMission | null>(
    () => practiceRecommendations[0] ?? null,
    [practiceRecommendations],
  );

  const homePracticeMission = useMemo(
    () =>
      homePracticeRecommendation
        ? practiceMissions.find((mission) => mission.id === homePracticeRecommendation.id) ?? null
        : null,
    [homePracticeRecommendation, practiceMissions],
  );

  const weeklyPracticePlanSummary = useMemo(
    () =>
      buildWeeklyPracticePlanHomeSummary({
        missions: practiceMissions,
        history: practiceHistory,
        now: practiceGoalNow,
        targetMissionsPerWeek: weeklyGoalSettings.targetMissionsPerWeek,
      }),
    [practiceGoalNow, practiceHistory, practiceMissions, weeklyGoalSettings.targetMissionsPerWeek],
  );

  const homePracticeRecommendationReason = useMemo(() => {
    if (!homePracticeRecommendation) return null;
    switch (homePracticeRecommendation.reason) {
      case 'focus_area':
        return t('practice.missionRecommendations.reason.focus_area');
      case 'goal_progress':
        return t('practice.missionRecommendations.reason.goal_progress');
      default:
        return t('practice.missionRecommendations.reason.fallback');
    }
  }, [homePracticeRecommendation, t]);

  const homePracticeRecommendationContext = useMemo<PracticeRecommendationContext | null>(() => {
    if (!homePracticeRecommendation || !homePracticeMission || practiceRecommendationsSuppressed) return null;
    const algorithmVersion = homePracticeRecommendation.algorithmVersion ?? 'v1';
    const focusArea = homePracticeRecommendation.focusArea ?? (homePracticeMission as any)?.focusArea;

    return {
      source: 'practice_recommendations',
      surface: 'mobile_home_practice',
      rank: homePracticeRecommendation.rank,
      focusArea,
      reasonKey: homePracticeRecommendation.reason,
      algorithmVersion,
      experiment: {
        experimentKey: practiceRecommendationsExperiment.experimentKey,
        experimentBucket: practiceRecommendationsExperiment.experimentBucket,
        experimentVariant: practiceRecommendationsExperiment.experimentVariant,
      },
    };
  }, [
    homePracticeMission,
    homePracticeRecommendation,
    practiceRecommendationsExperiment.experimentBucket,
    practiceRecommendationsExperiment.experimentKey,
    practiceRecommendationsExperiment.experimentVariant,
    practiceRecommendationsSuppressed,
  ]);

  const practicePlanCopy = useMemo(() => {
    if (!weeklyPracticePlanSummary.hasPlan) return null;
    if (weeklyPracticePlanSummary.isPlanCompleted) return t('practice_home_plan_done');
    return t('practice_home_plan_progress', {
      completed: weeklyPracticePlanSummary.completedCount,
      total: weeklyPracticePlanSummary.totalCount,
    });
  }, [weeklyPracticePlanSummary]);

  useEffect(() => {
    if (planCompletedViewedRef.current) return;
    if (!weeklyPracticePlanSummary.hasPlan || !weeklyPracticePlanSummary.isPlanCompleted) return;

    planCompletedViewedRef.current = true;
    safeEmit('practice_plan_completed_viewed', {
      entryPoint: 'home',
      completedMissions: weeklyPracticePlanSummary.completedCount,
      totalMissions: weeklyPracticePlanSummary.totalCount,
      isPlanCompleted: true,
    });
  }, [weeklyPracticePlanSummary]);

  useEffect(() => {
    if (!shouldRenderWeeklyGoalNudge || !practiceGoalProgress) return;
    const nudgeKey = `${practiceGoalProgress.completedInWindow}/${practiceGoalProgress.targetCompletions}/${experimentBucket}`;
    if (goalNudgeShownRef.current === nudgeKey) return;

    trackPracticeGoalNudgeShown(telemetryClient, {
      progress: practiceGoalProgress,
      surface: 'mobile_home',
      experimentKey: 'weekly_goal_nudge',
      experimentBucket,
      experimentVariant,
    });
    goalNudgeShownRef.current = nudgeKey;
  }, [
    experimentBucket,
    experimentVariant,
    practiceGoalProgress,
    shouldRenderWeeklyGoalNudge,
    telemetryClient,
  ]);

  useEffect(() => {
    if (
      loading ||
      !homePracticeRecommendation ||
      !homePracticeMission ||
      practiceRecommendationsSuppressed ||
      practiceRecommendationImpressionsRef.current.has(homePracticeRecommendation.id)
    )
      return;

    const algorithmVersion = homePracticeRecommendation.algorithmVersion ?? 'v1';
    const focusArea = homePracticeRecommendation.focusArea ?? (homePracticeMission as any)?.focusArea;

    emitPracticeMissionRecommendationShown(telemetryClient, {
      missionId: homePracticeRecommendation.id,
      reason: homePracticeRecommendation.reason,
      rank: homePracticeRecommendation.rank,
      surface: 'mobile_home_practice',
      focusArea,
      algorithmVersion,
      experiment: {
        experimentKey: practiceRecommendationsExperiment.experimentKey,
        experimentBucket: practiceRecommendationsExperiment.experimentBucket,
        experimentVariant: practiceRecommendationsExperiment.experimentVariant,
      },
    });

    practiceRecommendationImpressionsRef.current.add(homePracticeRecommendation.id);
  }, [
    homePracticeMission,
    homePracticeRecommendation,
    loading,
    practiceRecommendationImpressionsRef,
    practiceRecommendationsExperiment.experimentBucket,
    practiceRecommendationsExperiment.experimentKey,
    practiceRecommendationsExperiment.experimentVariant,
    practiceRecommendationsSuppressed,
    telemetryClient,
  ]);

  const readinessSuggestion = useMemo(() => {
    if (!bagReadinessOverview?.suggestions.length) return null;
    return formatBagSuggestion(bagReadinessOverview.suggestions[0], clubLabels);
  }, [bagReadinessOverview?.suggestions, clubLabels]);

  const practiceRecommendation = useMemo<BagPracticeRecommendation | null>(() => {
    if (!bagReadinessOverview) return null;

    return getTopPracticeRecommendation({
      overview: bagReadinessOverview,
      suggestions: bagReadinessOverview.suggestions,
      history: practiceHistory,
    });
  }, [bagReadinessOverview, practiceHistory]);

  const handleWeeklyGoalNudgePress = useCallback(() => {
    if (!practiceGoalProgress) return;
    trackPracticeGoalNudgeClicked(telemetryClient, {
      progress: practiceGoalProgress,
      surface: 'mobile_home',
      experimentKey: 'weekly_goal_nudge',
      experimentBucket,
      experimentVariant,
      cta: 'practice_missions',
    });
    navigation.navigate('PracticeMissions', { source: 'home' });
  }, [
    experimentBucket,
    experimentVariant,
    navigation,
    practiceGoalProgress,
    telemetryClient,
  ]);

  const handleOpenPracticeProgress = useCallback(() => {
    if (practiceProgressModel?.hasData) {
      navigation.navigate('PracticeHistory');
    } else {
      navigation.navigate('RangeQuickPracticeStart', { entrySource: 'range_home' });
    }
  }, [navigation, practiceProgressModel?.hasData]);

  const latestRoundDisplay = useMemo(() => {
    if (!latestRound) return null;
    const ended = latestRound.endedAt ?? latestRound.startedAt;
    const date = formatDate(ended);
    const score =
      formatToPar(latestRound.totalToPar ?? null) ??
      (typeof latestRound.totalStrokes === 'number' ? `${latestRound.totalStrokes}` : null);
    return {
      course: latestRound.courseId || t('home_dashboard_last_round_unknown_course'),
      date,
      score,
      roundId: latestRound.roundId,
    };
  }, [latestRound]);

  const practiceHeadline = useMemo(() => {
    if (!practicePlan?.drills?.length) return t('home_dashboard_practice_prompt');
    const drills = practicePlan.drills.length;
    const totalMinutes = practicePlan.drills.reduce((sum, drill) => sum + (drill.durationMinutes ?? 0), 0);
    const minutes = totalMinutes || drills * 15;
    return t('home_dashboard_practice_today', { drills, minutes });
  }, [practicePlan]);

  const bagSummary = useMemo(() => summarizeBag(bag), [bag]);

  const weeklyProgress = useMemo(() => {
    const rounds = weeklySummary?.roundsPlayed ?? 0;
    const progress = Math.min(rounds / TARGET_ROUNDS_PER_WEEK, 1);
    return { rounds, progress };
  }, [weeklySummary?.roundsPlayed ?? 0]);

  const weeklyTopCategory = useMemo(() => {
    switch (weeklySummary?.focusCategory) {
      case 'driving':
        return t('weekly.focus.driving');
      case 'approach':
        return t('weekly.focus.approach');
      case 'short_game':
        return t('weekly.focus.short_game');
      case 'putting':
        return t('weekly.focus.putting');
      default:
        return t('weekly.focus.overall');
    }
  }, [weeklySummary?.focusCategory]);

  const hasNewWeeklySummary = useMemo(() => {
    if (!weeklySummary?.endDate) return false;
    if ((weeklySummary.roundsPlayed ?? 0) <= 0) return false;
    const periodTime = new Date(weeklySummary.endDate).getTime();
    if (Number.isNaN(periodTime)) return false;
    const lastSeen = engagement?.lastSeenWeeklySummaryAt;
    if (!lastSeen) return true;
    const lastSeenTime = new Date(lastSeen).getTime();
    if (Number.isNaN(lastSeenTime)) return true;
    return periodTime > lastSeenTime;
  }, [engagement?.lastSeenWeeklySummaryAt, weeklySummary]);

  const hasNewCoachReport = useMemo(() => {
    if (!latestRound?.roundId) return false;
    if (!latestRound?.endedAt && !latestRound?.startedAt) return false;
    const lastSeen = engagement?.lastSeenCoachReportRoundId;
    if (!lastSeen) return true;
    return lastSeen !== latestRound.roundId;
  }, [engagement?.lastSeenCoachReportRoundId, latestRound]);

  const practiceRecommendationCopy = useMemo(() => {
    if (!practiceRecommendation) return null;

    const [firstClubId, secondClubId] = practiceRecommendation.targetClubs;
    const lower = firstClubId ? clubLabels[firstClubId] ?? firstClubId : undefined;
    const upper = secondClubId ? clubLabels[secondClubId] ?? secondClubId : undefined;
    const club = lower;

    return {
      title: t(practiceRecommendation.titleKey, { lower, upper, club }),
      description: t(practiceRecommendation.descriptionKey, { lower, upper, club }),
    };
  }, [clubLabels, practiceRecommendation]);

  const practiceRecommendationStatusLabel = useMemo(() => {
    if (!practiceRecommendation) return null;
    if (practiceRecommendation.status === 'new') return t('bag.practice.status.new');
    if (practiceRecommendation.status === 'due') return t('bag.practice.status.due');
    return t('bag.practice.status.fresh');
  }, [practiceRecommendation]);

  const markWeeklySeen = useCallback(async () => {
    const timestamp = weeklySummary?.endDate;
    if (!timestamp) return;
    setState((prev) => ({
      ...prev,
      engagement: { ...(prev.engagement ?? {}), lastSeenWeeklySummaryAt: timestamp },
    }));
    try {
      await saveEngagementState({ lastSeenWeeklySummaryAt: timestamp });
    } catch (err) {
      console.warn('Home dashboard engagement save failed (weekly)', err);
    }
  }, [weeklySummary?.endDate]);

  const markCoachReportSeen = useCallback(async () => {
    const roundId = latestRound?.roundId;
    if (!roundId) return;
    setState((prev) => ({
      ...prev,
      engagement: { ...(prev.engagement ?? {}), lastSeenCoachReportRoundId: roundId },
    }));
    try {
      await saveEngagementState({ lastSeenCoachReportRoundId: roundId });
    } catch (err) {
      console.warn('Home dashboard engagement save failed (coach report)', err);
    }
  }, [latestRound?.roundId]);

  const handleQuickStart = useCallback(async () => {
    setQuickStarting(true);
    try {
      const courses = await fetchCourses().catch(() => null);
      if (!courses || courses.length === 0) {
        navigation.navigate('RoundStart');
        return;
      }

      const nearest = computeNearestCourse(
        courses.map((course) => ({
          id: course.id,
          name: course.name,
          location: course.location ?? null,
        })),
        geo.position,
      );

      if (!nearest.suggestedCourseId) {
        navigation.navigate('RoundStart');
        return;
      }

      const layout = await fetchCourseLayout(nearest.suggestedCourseId).catch(() => null);
      if (!layout) {
        navigation.navigate('RoundStart');
        return;
      }

      const plan = buildQuickStartPlan({
        courses,
        playerPosition: geo.position,
        courseLayoutsById: { [layout.id]: layout },
      });

      if (!plan) {
        navigation.navigate('RoundStart');
        return;
      }

      const round = await startRound({
        courseId: plan.courseId,
        startHole: plan.startHole,
        holes: plan.holeCount,
      });

      await saveActiveRoundState({ round, currentHole: round.startHole ?? 1 });
      navigation.navigate('RoundShot', { roundId: round.id });
    } catch (err) {
      navigation.navigate('RoundStart');
    } finally {
      setQuickStarting(false);
    }
  }, [geo.position, navigation]);

  const handleOpenWeekly = useCallback(() => {
    navigation.navigate('WeeklySummary');
    void markWeeklySeen();
  }, [markWeeklySeen, navigation]);

  const handleOpenCoachReport = useCallback(() => {
    if (!latestRoundDisplay) return;
    navigation.navigate('CoachReport', {
      roundId: latestRoundDisplay.roundId,
      courseName: latestRoundDisplay.course,
      date: latestRoundDisplay.date ?? undefined,
    });
    void markCoachReportSeen();
  }, [latestRoundDisplay, markCoachReportSeen, navigation]);

  const handleShareWeekly = useCallback(async () => {
    if (!weeklySummary) return;
    setSharingWeekly(true);

    try {
      const highlight = weeklySummary.highlight?.value;
      const firstHint = weeklySummary.focusHints[0];
      const message = t('weekly.share.template', {
        rounds: weeklySummary.roundsPlayed,
        holes: weeklySummary.holesPlayed,
        highlight: highlight ? `Highlight: ${highlight}. ` : '',
        focus: firstHint ? `Focus: ${firstHint.text}. ` : '',
      });
      await Share.share({ message });
      safeEmit('weekly_summary.shared', {
        rounds: weeklySummary.roundsPlayed,
        holes: weeklySummary.holesPlayed,
        hasHighlight: Boolean(weeklySummary.highlight),
      });
    } catch (err) {
      console.warn('[home] Failed to share weekly summary', err);
      Alert.alert(t('weeklySummary.shareErrorTitle'), t('weeklySummary.shareErrorBody'));
    } finally {
      setSharingWeekly(false);
    }
  }, [weeklySummary]);

  const handleStartHomePracticeRecommendation = useCallback(() => {
    if (!homePracticeRecommendation || !homePracticeMission) return;

    const algorithmVersion = homePracticeRecommendation.algorithmVersion ?? 'v1';
    const focusArea = homePracticeRecommendation.focusArea ?? (homePracticeMission as any)?.focusArea;

    if (!practiceRecommendationsSuppressed) {
      emitPracticeMissionRecommendationClicked(telemetryClient, {
        missionId: homePracticeRecommendation.id,
        reason: homePracticeRecommendation.reason,
        rank: homePracticeRecommendation.rank,
        surface: 'mobile_home_practice',
        entryPoint: 'home_card',
        focusArea,
        algorithmVersion,
        experiment: {
          experimentKey: practiceRecommendationsExperiment.experimentKey,
          experimentBucket: practiceRecommendationsExperiment.experimentBucket,
          experimentVariant: practiceRecommendationsExperiment.experimentVariant,
        },
      });
    }

    emitPracticeMissionStart(telemetryClient, {
      missionId: homePracticeRecommendation.id,
      sourceSurface: 'mobile_home_practice',
      recommendation: homePracticeRecommendationContext ?? undefined,
    });

    navigation.navigate('RangeQuickPracticeStart', {
      missionId: homePracticeRecommendation.id,
      entrySource: 'range_home',
      practiceRecommendationContext: homePracticeRecommendationContext ?? undefined,
    });
  }, [
    homePracticeMission,
    homePracticeRecommendation,
    homePracticeRecommendationContext,
    navigation,
    practiceRecommendationsExperiment.experimentBucket,
    practiceRecommendationsExperiment.experimentKey,
    practiceRecommendationsExperiment.experimentVariant,
    practiceRecommendationsSuppressed,
    telemetryClient,
  ]);

  const handleStartPracticeRecommendation = useCallback(() => {
    if (!practiceRecommendation) return;

    try {
      navigation.navigate('RangeQuickPracticeStart', {
        practiceRecommendation,
        entrySource: 'range_home',
      });
    } catch (err) {
      console.warn('[home] Unable to start recommended practice from home', err);
      navigation.navigate('RangePractice');
    }
  }, [navigation, practiceRecommendation]);

  const handlePracticeFromSgFocus = useCallback(() => {
    if (!sgLightFocus) return;
    const { eventName, payload } = buildSgLightPracticeCtaClickTelemetry({
      surface: 'mobile_home_sg_light_focus',
      focusCategory: sgLightFocus.focusCategory,
    });
    safeEmit(eventName, payload);
    navigation.navigate('PracticeMissions', {
      source: 'mobile_home_sg_light_focus',
      practiceRecommendationSource: 'mobile_home_sg_light_focus',
      strokesGainedLightFocusCategory: sgLightFocus.focusCategory,
    });
  }, [navigation, sgLightFocus]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>{t('home_dashboard_loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} testID="home-dashboard">
      <View style={styles.header}>
        <Text style={styles.title} testID="home-dashboard-greeting">
          {deriveGreeting(profile)}
        </Text>
        <Text style={styles.subtitle}>{t('home_dashboard_subtitle')}</Text>
      </View>

      <TouchableOpacity
        onPress={() => navigation.navigate('MyBag')}
        activeOpacity={0.85}
        testID="home-bag-readiness"
      >
        <View style={styles.card}>
          <View style={styles.rowSpaceBetween}>
            <Text style={styles.cardTitle}>{t('bag.readinessTitle')}</Text>
            {bagReadinessOverview ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {t(`bag.readinessGrade.${bagReadinessOverview.readiness.grade}`)}
                </Text>
              </View>
            ) : null}
          </View>
          {bagReadinessOverview ? (
            <>
              <Text style={styles.readinessScore} testID="home-bag-readiness-score">
                {bagReadinessOverview.readiness.score}/100
              </Text>
              <Text style={styles.cardBody}>
                {t('bag.readinessSummary.base', {
                  calibrated: bagReadinessOverview.readiness.calibratedClubs,
                  total: bagReadinessOverview.readiness.totalClubs,
                })}
              </Text>
              <Text style={styles.muted}>
                {t('bag.readinessSummary.details', {
                  noData: bagReadinessOverview.readiness.noDataCount,
                  needsMore: bagReadinessOverview.readiness.needsMoreSamplesCount,
                  gaps: bagReadinessOverview.readiness.largeGapCount,
                  overlaps: bagReadinessOverview.readiness.overlapCount,
                })}
              </Text>
              {readinessSuggestion ? (
                <Text style={styles.suggestionLine} numberOfLines={2} testID="home-bag-readiness-suggestion">
                  {t('bag.readinessTileSuggestionPrefix')} {readinessSuggestion}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.cardBody}>{t('my_bag_error')}</Text>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('home_dashboard_quick_start_title')}</Text>
        {currentRound ? (
          <>
            <Text style={styles.cardBody}>
              {t('home_dashboard_quick_start_resume', {
                course: currentRound.courseName ?? currentRound.courseId ?? t('home_dashboard_unknown_course'),
              })}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('RoundShot', { roundId: currentRound.id })}
              testID="resume-round"
            >
              <View style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{t('home_dashboard_quick_start_resume_cta')}</Text>
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.cardBody}>{t('home_dashboard_quick_start_new_round')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('RoundStart')} testID="start-round">
              <View style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{t('home_dashboard_quick_start_new_round_cta')}</Text>
              </View>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity
          disabled={quickStarting}
          onPress={handleQuickStart}
          testID="quick-start-round"
          accessibilityLabel={t('home_dashboard_quick_start_gps_cta')}
        >
          <View style={[styles.secondaryButton, quickStarting && styles.disabledButton]}>
            {quickStarting ? (
              <ActivityIndicator color="#0f172a" />
            ) : (
              <Text style={styles.secondaryButtonText}>{t('home_dashboard_quick_start_gps_cta')}</Text>
            )}
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.rowSpaceBetween}>
          <Text style={styles.cardTitle}>{t('home_dashboard_last_round_title')}</Text>
          <View style={styles.rowGapSmall}>
            {hasNewCoachReport ? (
              <View style={styles.badge} testID="coach-badge">
                <View style={styles.badgeDot} />
                <Text style={styles.badgeText}>{t('home_dashboard_badge_new_coach_report')}</Text>
              </View>
            ) : null}
            {latestRoundDisplay && (
              <TouchableOpacity
                onPress={() => navigation.navigate('RoundRecap', { roundId: latestRoundDisplay.roundId })}
                testID="view-last-round"
              >
                <Text style={styles.link}>{t('home_dashboard_last_round_cta')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {latestRoundDisplay ? (
          <>
            <Text style={styles.cardBody} testID="last-round-course">{latestRoundDisplay.course}</Text>
            {latestRoundDisplay.date && <Text style={styles.muted}>{latestRoundDisplay.date}</Text>}
            {latestRoundDisplay.score && <Text style={styles.score}>{latestRoundDisplay.score}</Text>}
          </>
        ) : (
          <Text style={styles.cardBody} testID="last-round-empty">
            {t('home_dashboard_last_round_empty')}
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.rowSpaceBetween}>
          <Text style={styles.cardTitle}>{t('home_dashboard_weekly_title')}</Text>
          {hasNewWeeklySummary ? (
            <View style={styles.badge} testID="weekly-badge">
              <View style={styles.badgeDot} />
              <Text style={styles.badgeText}>{t('home_dashboard_badge_new')}</Text>
            </View>
          ) : null}
        </View>
        {weeklySummary ? (
          <>
            <Text style={styles.cardBody} testID="weekly-headline">
              {t('weekly.subtitle', { rounds: weeklySummary.roundsPlayed, holes: weeklySummary.holesPlayed })}
            </Text>
            <Text style={styles.muted}>
              {weeklySummary.highlight?.value ?? t('weekly.empty.body')}
            </Text>
            <View style={styles.progressBlock}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${weeklyProgress.progress * 100}%` }]} />
              </View>
              <Text style={styles.muted} testID="weekly-progress-text">
                {weeklyProgress.rounds === 0
                  ? t('home_dashboard_weekly_first_round')
                  : t('home_dashboard_weekly_progress', {
                      current: weeklyProgress.rounds,
                      target: TARGET_ROUNDS_PER_WEEK,
                    })}
              </Text>
            </View>
            {weeklySummary.roundsPlayed === 0 ? (
              <View style={styles.row}>
                <TouchableOpacity onPress={() => navigation.navigate('RoundStart')} testID="weekly-home-start">
                  <View style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>{t('weekly.cta.startRound')}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('RangePractice')} testID="weekly-home-range">
                  <View style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>{t('weekly.cta.range')}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            ) : null}
            <TouchableOpacity onPress={handleOpenWeekly} testID="open-weekly">
              <Text style={styles.link}>{t('home_dashboard_weekly_cta')}</Text>
            </TouchableOpacity>
            {latestRoundDisplay ? (
              <TouchableOpacity onPress={handleOpenCoachReport} testID="open-coach-report-weekly">
                <Text style={styles.link}>{t('coach_report_cta_from_recap')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={handleShareWeekly}
              disabled={sharingWeekly}
              testID="share-weekly-dashboard"
            >
              {sharingWeekly ? (
                <ActivityIndicator />
              ) : (
                <Text style={styles.link}>{t('home_dashboard_weekly_share')}</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.cardBody}>{t('home_dashboard_weekly_empty')}</Text>
        )}
      </View>

      {sgLightFocus ? (
        <View style={styles.card} testID="home-sg-focus-card">
          <Text style={styles.cardTitle}>{t('home_dashboard_focus_title')}</Text>
          <Text style={styles.cardBody} testID="home-sg-focus-label">
            {t(sgLightFocus.labelKey)}
          </Text>
          <Text style={styles.muted}>{t('home_dashboard_focus_helper')}</Text>
          <TouchableOpacity onPress={handlePracticeFromSgFocus} testID="home-sg-focus-cta">
            <Text style={styles.link}>{t('home_dashboard_focus_cta')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {practiceProgressModel ? (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.9}
          onPress={handleOpenPracticeProgress}
          testID="practice-progress-card"
        >
          <Text style={styles.cardTitle}>{t('practice.progress.title')}</Text>
          <View style={styles.progressBlock}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(1, Math.max(0, practiceProgressModel.completionRatio)) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.cardBody} testID="practice-progress-summary">
              {t(practiceProgressModel.summaryKey, practiceProgressModel.summaryParams)}
            </Text>
            <Text style={styles.muted} testID="practice-progress-subtitle">
              {t(practiceProgressModel.subtitleKey, practiceProgressModel.subtitleParams)}
            </Text>
            {practiceGoalCopy.summary ? (
              <View style={[styles.rowSpaceBetween, styles.goalRow]}>
                <Text style={styles.cardBody} testID="practice-goal-summary">
                  {practiceGoalCopy.summary}
                </Text>
                {practiceGoalCopy.statusLabel ? (
                  <View
                    style={[
                      styles.goalPill,
                      practiceGoalProgress?.isOnTrack ? styles.goalPillOnTrack : styles.goalPillCatchUp,
                    ]}
                    testID="practice-goal-status"
                  >
                    <Text
                      style={[
                        styles.goalPillText,
                        practiceGoalProgress?.isOnTrack ? styles.goalPillTextOnTrack : styles.goalPillTextCatchUp,
                      ]}
                    >
                      {practiceGoalCopy.statusLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <TouchableOpacity
              onPress={() => navigation.navigate('WeeklyPracticeGoalSettings')}
              testID="edit-practice-goal"
            >
              <Text style={styles.link}>{t('practice.goal.settings.edit')}</Text>
            </TouchableOpacity>
            {practiceGoalStreakLabel ? (
              <Text style={styles.muted} testID="practice-goal-streak">
                {practiceGoalStreakLabel}
              </Text>
            ) : null}
            {practicePlanCopy ? (
              <Text style={styles.muted} testID="practice-plan-summary">
                {practicePlanCopy}
              </Text>
            ) : null}
            {shouldRenderWeeklyGoalNudge && weeklyGoalNudgeCopy ? (
              <View style={styles.goalNudge} testID="practice-goal-nudge">
                <Text style={styles.goalNudgeText}>{weeklyGoalNudgeCopy}</Text>
                <TouchableOpacity onPress={handleWeeklyGoalNudgePress} testID="practice-goal-nudge-cta">
                  <Text style={styles.link}>{t('practice.missions.cta.viewAll')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
          <TouchableOpacity onPress={handleOpenPracticeProgress} testID="open-practice-progress">
            <Text style={styles.link}>{t('practice.progress.cta')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('home_dashboard_practice_title')}</Text>
        <Text style={styles.cardBody} testID="practice-snippet">
          {practiceHeadline}
        </Text>
        {homePracticeRecommendation && homePracticeMission ? (
          <View style={[styles.recommendationBlock, styles.homeRecommendation]} testID="home-practice-recommendation">
            <Text style={styles.cardOverline}>{t('practice.missionRecommendations.badge')}</Text>
            <Text style={styles.cardTitle}>{t(homePracticeMission.title)}</Text>
            {homePracticeRecommendationReason ? (
              <Text style={styles.muted}>{homePracticeRecommendationReason}</Text>
            ) : null}
            <TouchableOpacity
              onPress={handleStartHomePracticeRecommendation}
              testID="home-practice-recommendation-cta"
            >
              <Text style={styles.link}>{t('home_dashboard_practice_next_cta')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {practiceRecommendationCopy ? (
          <View style={styles.recommendationBlock} testID="practice-next-mission">
            <View style={styles.rowSpaceBetween}>
              <Text style={styles.cardOverline}>{t('home_dashboard_practice_next_title')}</Text>
              {practiceRecommendationStatusLabel ? (
                <View style={styles.badge} testID="practice-next-status">
                  <Text style={styles.badgeText}>{practiceRecommendationStatusLabel}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.cardTitle}>{practiceRecommendationCopy.title}</Text>
            <Text style={styles.muted}>{practiceRecommendationCopy.description}</Text>
            <TouchableOpacity onPress={handleStartPracticeRecommendation} testID="practice-next-cta">
              <Text style={styles.link}>{t('home_dashboard_practice_next_cta')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <TouchableOpacity
          onPress={() => navigation.navigate('PracticeMissions', { source: 'home' })}
          testID="open-practice-missions"
        >
          <Text style={styles.link}>{t('practice.missions.cta.viewAll')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('PracticePlanner')} testID="open-practice">
          <Text style={styles.link}>{t('home_dashboard_practice_cta')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('home_dashboard_bag_title')}</Text>
        <Text style={styles.cardBody} testID="bag-status">
          {t('home_dashboard_bag_status', {
            calibrated: bagSummary.calibrated,
            total: Math.max(bagSummary.total, bagSummary.calibrated),
          })}
        </Text>
        <Text style={styles.muted}>{t('home_dashboard_bag_helper')}</Text>
        {bagSummary.needsMore > 0 ? (
          <Text style={styles.muted} testID="bag-needs-more">
            {t('home_dashboard_bag_needs_more', { count: bagSummary.needsMore })}
          </Text>
        ) : null}
        <TouchableOpacity onPress={() => navigation.navigate('MyBag')} testID="open-bag">
          <Text style={styles.link}>{t('home_dashboard_bag_cta')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: '#111827',
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    color: '#4b5563',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  cardOverline: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  cardBody: {
    fontSize: 14,
    color: '#1f2937',
  },
  muted: {
    color: '#6b7280',
    fontSize: 13,
  },
  readinessScore: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
  },
  score: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 4,
    borderColor: '#d1d5db',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.7,
  },
  link: {
    color: '#2563eb',
    fontWeight: '600',
  },
  rowSpaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowGapSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef2ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6366f1',
  },
  badgeText: {
    color: '#312e81',
    fontWeight: '700',
    fontSize: 12,
  },
  suggestionLine: {
    color: '#1f2937',
    fontSize: 13,
    marginTop: 6,
  },
  recommendationBlock: {
    gap: 6,
    paddingVertical: 4,
  },
  homeRecommendation: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 10,
  },
  progressBlock: {
    gap: 6,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22c55e',
  },
  goalRow: {
    alignItems: 'center',
    marginTop: 2,
  },
  goalNudge: {
    backgroundColor: '#ecfeff',
    borderRadius: 10,
    padding: 10,
    gap: 6,
    marginTop: 6,
  },
  goalNudgeText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  goalPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  goalPillOnTrack: {
    backgroundColor: '#ecfdf3',
  },
  goalPillCatchUp: {
    backgroundColor: '#fff7ed',
  },
  goalPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  goalPillTextOnTrack: {
    color: '#166534',
  },
  goalPillTextCatchUp: {
    color: '#9a3412',
  },
});

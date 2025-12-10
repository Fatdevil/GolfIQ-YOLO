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
  startRound,
  type RoundInfo,
  type RoundSummaryWithRoundInfo,
} from '@app/api/roundClient';
import { fetchPracticePlan, type PracticePlan } from '@app/api/practiceClient';
import { fetchPlayerProfile, type PlayerProfile } from '@app/api/player';
import { fetchWeeklySummary, type WeeklySummary } from '@app/api/weeklySummary';
import { createWeeklyShareLink } from '@app/api/shareClient';
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
import { safeEmit } from '@app/telemetry';
import { buildMissionProgressById, type PracticeMissionHistoryEntry } from '@shared/practice/practiceHistory';
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
import {
  buildPracticeMissionsList,
  type PracticeMissionDefinition,
  type PracticeMissionListItem,
} from '@shared/practice/practiceMissionsList';
import { buildWeeklyPracticePlanHomeSummary } from '@shared/practice/practicePlan';

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
  const planCompletedViewedRef = useRef(false);
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
        const history = await loadPracticeMissionHistory();
        if (cancelled) return;
        setPracticeOverview(summarizeRecentPracticeHistory(history, new Date()));
        setPracticeHistory(history);
      } catch (err) {
        if (!cancelled) {
          console.warn('Home dashboard practice history load failed', err);
          setPracticeOverview({
            totalSessions: 0,
            completedSessions: 0,
            windowDays: PRACTICE_MISSION_WINDOW_DAYS,
          });
          setPracticeHistory([]);
        }
      }
    };

    loadPracticeHistory().catch((err) => console.warn('Home dashboard practice history crashed', err));

    return () => {
      cancelled = true;
    };
  }, []);

  const { loading, profile, currentRound, latestRound, weeklySummary, practicePlan, bag, bagStats, engagement } = state;

  const practiceProgressModel = useMemo(
    () => buildPracticeProgressTileModel(practiceOverview),
    [practiceOverview],
  );

  const practiceGoalNow = new Date(Date.now());
  const practiceGoalProgress = useMemo(
    () => buildWeeklyPracticeGoalProgress({ missionHistory: practiceHistory, now: practiceGoalNow }),
    [practiceHistory, practiceGoalNow],
  );

  const practiceGoalStreak = useMemo(
    () => buildWeeklyGoalStreak(practiceHistory, practiceGoalNow),
    [practiceHistory, practiceGoalNow],
  );

  const practiceGoalStreakLabel = useMemo(() => {
    const streakWeeks = practiceGoalStreak.currentStreakWeeks;
    if (streakWeeks < 2) return null;
    return t('practice_goal_streak_label', { count: streakWeeks });
  }, [practiceGoalStreak.currentStreakWeeks, t]);

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

  const weeklyPracticePlanSummary = useMemo(
    () =>
      buildWeeklyPracticePlanHomeSummary({
        missions: practiceMissions,
        history: practiceHistory,
        now: practiceGoalNow,
      }),
    [practiceGoalNow, practiceHistory, practiceMissions],
  );

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
    const rounds = weeklySummary?.period.roundCount ?? 0;
    const progress = Math.min(rounds / TARGET_ROUNDS_PER_WEEK, 1);
    return { rounds, progress };
  }, [weeklySummary?.period.roundCount ?? 0]);

  const weeklyTopCategory = useMemo(() => {
    const categories = weeklySummary?.categories ?? {};
    const order: Array<keyof typeof categories> = ['driving', 'approach', 'short_game', 'putting'];
    for (const key of order) {
      const category = categories[key];
      if (category?.grade || category?.note) {
        return t(`weeklySummary.categories.${key}` as const);
      }
    }
    return t('weeklySummary.categories.driving');
  }, [weeklySummary?.categories]);

  const hasNewWeeklySummary = useMemo(() => {
    if (!weeklySummary?.period.to) return false;
    if ((weeklySummary.period.roundCount ?? 0) <= 0) return false;
    const periodTime = new Date(weeklySummary.period.to).getTime();
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
    const timestamp = weeklySummary?.period.to;
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
  }, [weeklySummary?.period.to]);

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
    const rounds = weeklySummary.period.roundCount ?? 0;
    const avgScoreRaw = weeklySummary.coreStats.avgScore;
    const avgScore =
      avgScoreRaw == null ? '—' : avgScoreRaw.toFixed(Number.isInteger(avgScoreRaw) ? 0 : 1);
    const fallbackMessage = t('weeklySummary.shareFallback', {
      rounds,
      avgScore,
      topCategory: weeklyTopCategory,
    });

    setSharingWeekly(true);

    try {
      const link = await createWeeklyShareLink();
      const message = t('weeklySummary.shareTemplate', {
        rounds,
        avgScore,
        topCategory: weeklyTopCategory,
        url: link.url,
      });
      await Share.share({ message });
    } catch (err) {
      console.warn('[home] Failed to share weekly summary', err);
      try {
        await Share.share({ message: fallbackMessage });
      } catch (shareErr) {
        console.warn('[home] Failed to share weekly fallback', shareErr);
        Alert.alert(t('weeklySummary.shareErrorTitle'), t('weeklySummary.shareErrorBody'));
      }
    } finally {
      setSharingWeekly(false);
    }
  }, [weeklySummary, weeklyTopCategory]);

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
              {`${weeklySummary.headline.emoji ?? ''} ${weeklySummary.headline.text}`.trim()}
            </Text>
            <Text style={styles.muted}>
              {t('home_dashboard_weekly_summary', {
                rounds: weeklySummary.period.roundCount,
                avg: weeklySummary.coreStats.avgScore ?? '–',
              })}
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

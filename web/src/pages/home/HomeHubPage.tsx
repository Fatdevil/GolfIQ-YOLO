import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { FeatureGate } from "@/access/FeatureGate";
import { UpgradeGate } from "@/access/UpgradeGate";
import { useAccessFeatures, useAccessPlan } from "@/access/UserAccessContext";
import { fetchBagStats } from "@/api/bagStatsClient";
import {
  computeOnboardingChecklist,
  markHomeSeen,
  type OnboardingChecklist,
} from "@/onboarding/checklist";
import { seedDemoData } from "@/demo/demoData";
import { useNotifications } from "@/notifications/NotificationContext";
import { mapBagStateToPlayerBag } from "@web/bag/utils";
import { loadBag } from "@web/bag/storage";
import type { BagState } from "@web/bag/types";
import { buildBagReadinessOverview, type BagReadinessOverview } from "@shared/caddie/bagReadiness";
import type { BagClubStatsMap } from "@shared/caddie/bagStats";
import type { BagSuggestion } from "@shared/caddie/bagTuningSuggestions";
import { useUnits } from "@/preferences/UnitsContext";
import { formatBagSuggestion } from "@/bag/formatBagSuggestion";
import {
  PRACTICE_MISSION_WINDOW_DAYS,
  loadPracticeMissionHistory,
} from "@/practice/practiceMissionHistory";
import { buildMissionProgressById, type PracticeMissionHistoryEntry } from "@shared/practice/practiceHistory";
import { buildWeeklyGoalStreak, buildWeeklyPracticeGoalProgress, type PracticeGoalStatus } from "@shared/practice/practiceGoals";
import { shouldShowWeeklyGoalNudge } from "@shared/practice/practiceGoalNudge";
import { buildWeeklyPracticePlanHomeSummary } from "@shared/practice/practicePlan";
import {
  buildPracticeMissionsList,
  type PracticeMissionDefinition,
  type PracticeMissionListItem,
} from "@shared/practice/practiceMissionsList";
import { buildPracticeReadinessSummary } from "@shared/practice/practiceReadiness";
import {
  trackPracticePlanCompletedViewed,
  trackPracticeGoalNudgeClicked,
  trackPracticeGoalNudgeShown,
  trackWeeklyPracticeGoalSettingsUpdated,
  trackPracticeMissionRecommendationClicked,
  trackPracticeMissionRecommendationShown,
} from "@/practice/analytics";
import {
  loadWeeklyPracticeGoalSettings,
  saveWeeklyPracticeGoalSettings,
} from "@/practice/practiceGoalSettings";
import { getDefaultWeeklyPracticeGoalSettings, type WeeklyPracticeGoalSettings } from "@shared/practice/practiceGoalSettings";
import { buildPracticeDecisionContext } from "@shared/practice/practiceDecisionContext";
import { recommendPracticeMissions, type RecommendedMission } from "@shared/practice/recommendPracticeMissions";
import type { PracticeRecommendationContext } from "@shared/practice/practiceRecommendationsAnalytics";
import { getExperimentBucket, getExperimentVariant, getPracticeRecommendationsExperiment, isInExperiment } from "@shared/experiments/flags";
import { getCurrentUserId } from "@/user/currentUserId";

const WEEKLY_GOAL_OPTIONS = [1, 3, 5];

const Card: React.FC<{
  title: string;
  subtitle: string;
  action: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ title, subtitle, action, children, footer }) => (
  <div className="flex h-full flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
    <div className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        <p className="text-sm text-slate-400">{subtitle}</p>
      </div>
      {children}
    </div>
    <div className="mt-4 flex items-center justify-between gap-3">
      {footer}
      {action}
    </div>
  </div>
);

const GhostMatchBadge: React.FC = () => {
  const { hasPlanFeature } = useAccessFeatures();
  const { t } = useTranslation();

  const enabled = hasPlanFeature("RANGE_GHOSTMATCH");

  return (
    <FeatureGate feature="range.ghostMatch">
      {enabled ? (
        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
          {t("home.range.badge.ghostmatch")}
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
          {t("home.range.badge.ghostmatch")}
        </span>
      )}
    </FeatureGate>
  );
};

function mapSuggestionToMissionDefinition(
  suggestion: BagSuggestion,
): PracticeMissionDefinition | null {
  if (suggestion.type === "fill_gap" && suggestion.lowerClubId && suggestion.upperClubId) {
    return {
      id: `practice_fill_gap:${suggestion.lowerClubId}:${suggestion.upperClubId}`,
      titleKey: "bag.practice.fill_gap.title",
      descriptionKey: "bag.practice.fill_gap.description",
    };
  }

  if (suggestion.type === "reduce_overlap" && suggestion.lowerClubId && suggestion.upperClubId) {
    return {
      id: `practice_reduce_overlap:${suggestion.lowerClubId}:${suggestion.upperClubId}`,
      titleKey: "bag.practice.reduce_overlap.title",
      descriptionKey: "bag.practice.reduce_overlap.description",
    };
  }

  if (suggestion.type === "calibrate" && suggestion.clubId) {
    return {
      id: `practice_calibrate:${suggestion.clubId}`,
      titleKey: "bag.practice.calibrate.title",
      descriptionKey: "bag.practice.calibrate.more_samples.description",
    };
  }

  return null;
}

function buildMissionDefinitions(
  bagReadiness: BagReadinessOverview | null,
  history: PracticeMissionHistoryEntry[],
): PracticeMissionDefinition[] {
  const map = new Map<string, PracticeMissionDefinition>();

  bagReadiness?.suggestions?.forEach((suggestion: BagSuggestion) => {
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

export const HomeHubPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { plan, isPro } = useAccessPlan();
  const { notify } = useNotifications();
  const { unit } = useUnits();
  const [bag] = useState<BagState>(() => loadBag());
  const [checklist, setChecklist] = useState<OnboardingChecklist>(() =>
    computeOnboardingChecklist(),
  );
  const [bagStats, setBagStats] = useState<BagClubStatsMap | null>(null);
  const [bagStatsLoading, setBagStatsLoading] = useState(false);
  const [practiceHistory, setPracticeHistory] = useState<
    PracticeMissionHistoryEntry[]
  >([]);
  const [weeklyGoalSettings, setWeeklyGoalSettings] = useState<WeeklyPracticeGoalSettings>(
    () => getDefaultWeeklyPracticeGoalSettings(),
  );
  const [editingPracticeGoal, setEditingPracticeGoal] = useState(false);
  const planCompletedViewedRef = useRef(false);
  const goalNudgeShownRef = useRef<string | null>(null);
  const practiceRecommendationImpressionsRef = useRef(new Set<string>());

  useEffect(() => {
    markHomeSeen();
    setChecklist(computeOnboardingChecklist());
  }, []);

  const handleSeedDemo = async () => {
    await seedDemoData();
    setChecklist(computeOnboardingChecklist());
    notify("success", t("onboarding.seed.success"));
  };

  useEffect(() => {
    let cancelled = false;
    setBagStatsLoading(true);
    fetchBagStats()
      .then((stats) => {
        if (!cancelled) {
          setBagStats(stats);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBagStats(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBagStatsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadPracticeMissionHistory()
      .then((history) => {
        if (!cancelled) setPracticeHistory(history);
      })
      .catch(() => {
        if (!cancelled) setPracticeHistory([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const settings = loadWeeklyPracticeGoalSettings();
      setWeeklyGoalSettings(settings);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[practiceGoalSettings] Failed to load weekly goal settings", err);
      setWeeklyGoalSettings(getDefaultWeeklyPracticeGoalSettings());
    }
  }, []);

  const playerBag = useMemo(() => mapBagStateToPlayerBag(bag), [bag]);
  const bagReadiness = useMemo(
    () => buildBagReadinessOverview(playerBag, bagStats ?? {}),
    [bagStats, playerBag],
  );
  const clubLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    bag.clubs.forEach((club) => {
      labels[club.id] = club.label;
    });
    return labels;
  }, [bag.clubs]);
  const readinessSuggestion = useMemo(
    () =>
      bagReadiness.suggestions.length > 0
        ? formatBagSuggestion(bagReadiness.suggestions[0], clubLabels, unit, t)
        : null,
    [bagReadiness.suggestions, clubLabels, t, unit],
  );
  const practiceGoalNow = new Date(Date.now());
  const experimentUserId = getCurrentUserId() ?? "anonymous";
  const targetMissionsPerWeek = weeklyGoalSettings.targetMissionsPerWeek;
  const handleSelectWeeklyGoal = (target: number) => {
    if (target === targetMissionsPerWeek) {
      setEditingPracticeGoal(false);
      return;
    }

    const previousTarget = targetMissionsPerWeek;
    const nextSettings: WeeklyPracticeGoalSettings = {
      targetMissionsPerWeek: target,
    };
    setWeeklyGoalSettings(nextSettings);
    saveWeeklyPracticeGoalSettings(nextSettings);
    trackWeeklyPracticeGoalSettingsUpdated({
      previousTarget,
      newTarget: nextSettings.targetMissionsPerWeek,
      source: "web_home_inline",
    });
    setEditingPracticeGoal(false);
  };
  const practiceMissions = useMemo<PracticeMissionListItem[]>(() => {
    const missions = buildMissionDefinitions(bagReadiness, practiceHistory);
    if (missions.length === 0) return [];

    const missionProgressById = buildMissionProgressById(
      practiceHistory,
      missions.map((mission) => mission.id),
      { windowDays: PRACTICE_MISSION_WINDOW_DAYS, now: practiceGoalNow },
    );

    return buildPracticeMissionsList({
      bagReadiness,
      missionProgressById,
      missions,
    });
  }, [bagReadiness, practiceGoalNow, practiceHistory]);
  const practiceReadinessSummary = useMemo(
    () => buildPracticeReadinessSummary({ history: practiceHistory, goalSettings: weeklyGoalSettings }),
    [practiceHistory, weeklyGoalSettings],
  );

  const practiceDecisionContext = useMemo(
    () => buildPracticeDecisionContext({ summary: practiceReadinessSummary, source: 'home' }),
    [practiceReadinessSummary],
  );

  const practiceRecommendationsExperiment = useMemo(
    () => getPracticeRecommendationsExperiment(experimentUserId),
    [experimentUserId],
  );

  const practiceRecommendationsSuppressed =
    practiceRecommendationsExperiment.experimentVariant === "disabled" ||
    !practiceRecommendationsExperiment.enabled;

  const practiceRecommendations = useMemo(
    () =>
      practiceRecommendationsSuppressed
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
  const practiceGoalProgress = useMemo(
    () =>
      buildWeeklyPracticeGoalProgress({
        missionHistory: practiceHistory,
        now: practiceGoalNow,
        targetMissionsPerWeek,
      }),
    [practiceGoalNow, practiceHistory, targetMissionsPerWeek],
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
  const homePracticeRecommendationReason = useMemo(() => {
    if (!homePracticeRecommendation) return null;
    switch (homePracticeRecommendation.reason) {
      case "focus_area":
        return t("practice.missionRecommendations.reason.focus_area");
      case "goal_progress":
        return t("practice.missionRecommendations.reason.goal_progress");
      default:
        return t("practice.missionRecommendations.reason.fallback");
    }
  }, [homePracticeRecommendation, t]);

  const homePracticeRecommendationContext = useMemo<PracticeRecommendationContext | null>(() => {
    if (!homePracticeRecommendation || !homePracticeMission || practiceRecommendationsSuppressed) return null;
    const algorithmVersion = homePracticeRecommendation.algorithmVersion ?? "v1";
    const focusArea = homePracticeRecommendation.focusArea ?? (homePracticeMission as any)?.focusArea;

    return {
      source: "practice_recommendations",
      surface: "web_home_practice",
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
  const weeklyGoalNudge = useMemo(
    () => shouldShowWeeklyGoalNudge(practiceHistory, weeklyGoalSettings, practiceGoalNow),
    [practiceGoalNow, practiceHistory, weeklyGoalSettings],
  );
  const experimentBucket = useMemo(
    () => getExperimentBucket("weekly_goal_nudge", experimentUserId),
    [experimentUserId],
  );
  const experimentVariant = useMemo(
    () => getExperimentVariant("weekly_goal_nudge", experimentUserId),
    [experimentUserId],
  );
  const shouldRenderWeeklyGoalNudge = useMemo(
    () => isInExperiment("weekly_goal_nudge", experimentUserId) && weeklyGoalNudge.shouldShow,
    [experimentUserId, weeklyGoalNudge.shouldShow],
  );
  const weeklyGoalNudgeCopy = useMemo(() => {
    if (!shouldRenderWeeklyGoalNudge) return null;
    if (weeklyGoalNudge.remainingMissions <= 1) {
      return "One session left to hit this week's practice goal";
    }
    const percent = Math.round(weeklyGoalNudge.completionPercent * 100);
    return `You're ${percent}% to your weekly goal – finish strong!`;
  }, [shouldRenderWeeklyGoalNudge, weeklyGoalNudge.completionPercent, weeklyGoalNudge.remainingMissions]);
  const practiceGoalStreakLabel = useMemo(() => {
    const streakWeeks = practiceGoalStreak.currentStreakWeeks;
    if (streakWeeks < 2) return null;
    return t("practice.goal.streak.label", { count: streakWeeks });
  }, [practiceGoalStreak.currentStreakWeeks, t]);
  const practiceGoalCopy = useMemo(() => {
    if (!practiceGoalProgress) return { summary: null, statusLabel: null };

    const summary = t("practice.goals.summary", {
      completed: practiceGoalProgress.completedInWindow,
      target: practiceGoalProgress.targetCompletions,
    });

    const status: PracticeGoalStatus | null = practiceGoalProgress.status;

    if (status === "not_started") {
      return { summary: t("practice.goals.emptyPrompt"), statusLabel: null };
    }

    if (status === "goal_reached") {
      return { summary, statusLabel: t("practice.goal.status.goal_reached_title") };
    }

    if (status === "exceeded") {
      return { summary, statusLabel: t("practice.goal.status.exceeded_title") };
    }

    return { summary, statusLabel: t("practice.goals.status.catchUp") };
  }, [practiceGoalProgress, t]);

  const practicePlanSummary = useMemo(
    () =>
      buildWeeklyPracticePlanHomeSummary({
        missions: practiceMissions,
        history: practiceHistory,
        now: practiceGoalNow,
        targetMissionsPerWeek,
      }),
    [practiceGoalNow, practiceHistory, practiceMissions, targetMissionsPerWeek],
  );

  const practicePlanCopy = useMemo(() => {
    if (!practicePlanSummary.hasPlan) return null;
    if (practicePlanSummary.isPlanCompleted) return t("practice.home.planDone");
    return t("practice.home.planProgress", {
      completed: practicePlanSummary.completedCount,
      total: practicePlanSummary.totalCount,
    });
  }, [practicePlanSummary, t]);

  useEffect(() => {
    if (planCompletedViewedRef.current) return;
    if (!practicePlanSummary.hasPlan || !practicePlanSummary.isPlanCompleted) return;

    planCompletedViewedRef.current = true;
    trackPracticePlanCompletedViewed({
      entryPoint: "home",
      completedMissions: practicePlanSummary.completedCount,
      totalMissions: practicePlanSummary.totalCount,
      isPlanCompleted: true,
      targetMissionsPerWeek,
    });
  }, [practicePlanSummary, targetMissionsPerWeek]);

  useEffect(() => {
    if (!shouldRenderWeeklyGoalNudge) return;
    const nudgeKey = `${practiceGoalProgress.completedInWindow}/${practiceGoalProgress.targetCompletions}/${experimentBucket}`;
    if (goalNudgeShownRef.current === nudgeKey) return;

    trackPracticeGoalNudgeShown({
      progress: practiceGoalProgress,
      surface: "web_home",
      experimentKey: "weekly_goal_nudge",
      experimentBucket,
      experimentVariant,
    });
    goalNudgeShownRef.current = nudgeKey;
  }, [
    experimentBucket,
    experimentVariant,
    practiceGoalProgress,
    shouldRenderWeeklyGoalNudge,
  ]);

  useEffect(() => {
    if (
      !homePracticeRecommendation ||
      !homePracticeMission ||
      practiceRecommendationsSuppressed ||
      practiceRecommendationImpressionsRef.current.has(homePracticeRecommendation.id)
    )
      return;

    const algorithmVersion = homePracticeRecommendation.algorithmVersion ?? "v1";
    const focusArea = homePracticeRecommendation.focusArea ?? (homePracticeMission as any)?.focusArea;

    trackPracticeMissionRecommendationShown({
      missionId: homePracticeRecommendation.id,
      reason: homePracticeRecommendation.reason,
      rank: homePracticeRecommendation.rank,
      surface: "web_home_practice",
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
    practiceRecommendationImpressionsRef,
    practiceRecommendationsExperiment.experimentBucket,
    practiceRecommendationsExperiment.experimentKey,
    practiceRecommendationsExperiment.experimentVariant,
    practiceRecommendationsSuppressed,
  ]);

  const handleGoalNudgeClick = () => {
    trackPracticeGoalNudgeClicked({
      progress: practiceGoalProgress,
      surface: "web_home",
      experimentKey: "weekly_goal_nudge",
      experimentBucket,
      experimentVariant,
      cta: "practice_missions",
    });
  };

  const handlePracticeRecommendationClick = () => {
    if (!homePracticeRecommendation || !homePracticeMission) return;

    const algorithmVersion = homePracticeRecommendation.algorithmVersion ?? "v1";
    const focusArea = homePracticeRecommendation.focusArea ?? (homePracticeMission as any)?.focusArea;

    if (!practiceRecommendationsSuppressed) {
      trackPracticeMissionRecommendationClicked({
        missionId: homePracticeRecommendation.id,
        reason: homePracticeRecommendation.reason,
        rank: homePracticeRecommendation.rank,
        surface: "web_home_practice",
        entryPoint: "home_card",
        focusArea,
        algorithmVersion,
        experiment: {
          experimentKey: practiceRecommendationsExperiment.experimentKey,
          experimentBucket: practiceRecommendationsExperiment.experimentBucket,
          experimentVariant: practiceRecommendationsExperiment.experimentVariant,
        },
      });
    }

    const params = new URLSearchParams({ mission: homePracticeRecommendation.id, source: "home_hub" });
    if (homePracticeRecommendationContext) {
      params.set("recommendation", JSON.stringify(homePracticeRecommendationContext));
    }

    navigate({ pathname: "/practice/missions", search: `?${params.toString()}` });
  };

  const effectivePlan = plan === "pro" ? "PRO" : "FREE";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-200/80">GolfIQ</div>
          <h1 className="text-2xl font-semibold text-slate-50">{t("home.header.title")}</h1>
          <p className="text-sm text-slate-400">{t("home.header.subtitle")}</p>
        </div>
        <div className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-100">
          <span className="font-semibold text-emerald-200">{t("app.title")}</span>
          <span className="ml-2 inline-flex items-center px-2 py-[2px] rounded-full border text-[10px] font-semibold">
            {effectivePlan === "PRO" ? t("access.plan.pro") : t("access.plan.free")}
          </span>
        </div>
      </header>

      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              {t("onboarding.title")}
            </h2>
            <p className="text-[11px] text-slate-400">
              {t("onboarding.subtitle")}
            </p>
          </div>
          {!checklist.allDone && (
            <button
              type="button"
              onClick={handleSeedDemo}
              data-testid="seed-demo-data"
              className="text-[11px] rounded border border-emerald-300/40 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-100 hover:bg-emerald-500/20"
            >
              {t("onboarding.seed.button")}
            </button>
          )}
        </header>

        <ul className="space-y-2 text-[11px]">
          {checklist.tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 text-slate-200">
              <span
                className={
                  "inline-flex h-3 w-3 rounded-full border " +
                  (task.done
                    ? "border-emerald-400 bg-emerald-500"
                    : "border-slate-500")
                }
              />
              <span
                className={
                  task.done ? "text-slate-400 line-through" : "text-slate-100"
                }
              >
                {t(task.labelKey)}
              </span>
            </li>
          ))}
        </ul>

        {checklist.allDone && (
          <p className="text-[11px] font-semibold text-emerald-200">
            {t("onboarding.allDone")}
          </p>
        )}
      </section>

      <Link
        to="/bag"
        className="block rounded-xl border border-emerald-800/60 bg-emerald-900/40 p-4 shadow-sm transition hover:border-emerald-500"
        data-testid="home-bag-readiness"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-emerald-50">{t("bag.readinessTitle")}</h2>
            <p className="text-sm text-emerald-100">
              {t("bag.readinessSummary.base", {
                calibrated: bagReadiness.readiness.calibratedClubs,
                total: bagReadiness.readiness.totalClubs,
              })}
            </p>
            <p className="text-xs text-emerald-200/80">
              {t("bag.readinessSummary.details", {
                noData: bagReadiness.readiness.noDataCount,
                needsMore: bagReadiness.readiness.needsMoreSamplesCount,
                gaps: bagReadiness.readiness.largeGapCount,
                overlaps: bagReadiness.readiness.overlapCount,
              })}
            </p>
            {bagStatsLoading ? (
              <p className="text-[11px] text-emerald-100/80">{t("bag.loading")}</p>
            ) : readinessSuggestion ? (
              <p className="text-sm font-semibold text-emerald-100" data-testid="home-bag-readiness-suggestion">
                {t("bag.readinessTileSuggestionPrefix")} {readinessSuggestion}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <div className="inline-flex items-center rounded-full border border-emerald-700/80 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
              {t(`bag.readinessGrade.${bagReadiness.readiness.grade}`)}
            </div>
            <div className="mt-2 text-3xl font-extrabold text-emerald-50" data-testid="home-bag-readiness-score">
              {bagReadiness.readiness.score}/100
            </div>
          </div>
        </div>
      </Link>

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          title={t("home.quick.title")}
          subtitle={t("home.quick.subtitle")}
          action={
            <Link
              to="/play"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-400"
            >
              {t("home.quick.button")}
            </Link>
          }
        >
          <div className="text-xs text-slate-400">
            <div className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-200">
              {t("home.quick.badge")}
            </div>
          </div>
        </Card>

        <Card
          title={t("home.range.title")}
          subtitle={t("home.range.subtitle")}
          action={
            <Link
              to={{ pathname: "/range/practice", search: "?entrySource=range_home" }}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-400"
            >
              {t("home.range.button")}
            </Link>
          }
          footer={
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-emerald-200">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5">
                  {t("home.range.badge.bingo")}
                </span>
                <GhostMatchBadge />
              </div>
              <Link
                to={{ pathname: "/practice/missions", search: "?source=home_hub" }}
                className="text-emerald-200 underline-offset-2 hover:text-emerald-100 hover:underline"
                data-testid="home-practice-missions-link"
              >
                {t("practice.missions.cta.viewAll")}
              </Link>
              <Link
                to="/practice/history"
                className="text-emerald-200 underline-offset-2 hover:text-emerald-100 hover:underline"
                data-testid="home-practice-history-link"
              >
                {t("practice.history.viewLink")}
              </Link>
            </div>
          }
        >
            <div className="space-y-2 text-sm text-slate-200">
            <div className="flex items-start justify-between gap-3" data-testid="practice-goal-row">
              <div className="space-y-1">
                <div data-testid="practice-goal-summary">{practiceGoalCopy.summary ?? ""}</div>
                <button
                  type="button"
                  onClick={() => setEditingPracticeGoal((prev) => !prev)}
                  className="text-[11px] font-semibold text-emerald-200 underline-offset-2 hover:text-emerald-100 hover:underline"
                  data-testid="practice-goal-edit"
                >
                  {t("practice.goal.edit")}
                </button>
              </div>
              {practiceGoalCopy.statusLabel ? (
                <span
                  className={
                    "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold " +
                    (practiceGoalProgress.isOnTrack
                      ? "bg-emerald-500/10 text-emerald-200"
                      : "bg-amber-500/10 text-amber-200")
                  }
                  data-testid="practice-goal-status"
                >
                  {practiceGoalCopy.statusLabel}
                </span>
              ) : null}
            </div>
            {editingPracticeGoal ? (
              <div className="space-y-2" data-testid="practice-goal-options">
                <p className="text-[11px] text-slate-400">{t("practice.goal.settings.subtitle")}</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKLY_GOAL_OPTIONS.map((target) => {
                    const selected = target === targetMissionsPerWeek;
                    return (
                      <button
                        key={target}
                        type="button"
                        onClick={() => handleSelectWeeklyGoal(target)}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                          selected
                            ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                            : "border-slate-700 bg-slate-800/60 text-slate-200 hover:border-emerald-400/60"
                        }`}
                        data-testid={`practice-goal-option-${target}`}
                      >
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
                            selected
                              ? "border-emerald-300 bg-emerald-500/30 text-slate-900"
                              : "border-slate-600 text-transparent"
                          }`}
                        >
                          ●
                        </span>
                        <span>{t("practice.goal.settings.optionLabel", { count: target })}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {practiceGoalStreakLabel ? (
              <div className="text-[11px] text-slate-400" data-testid="practice-goal-streak">
                {practiceGoalStreakLabel}
              </div>
            ) : null}
            {practicePlanCopy ? (
              <div className="text-[11px] text-slate-400" data-testid="practice-plan-summary">
                {practicePlanCopy}
              </div>
            ) : null}
            {homePracticeRecommendation && homePracticeMission ? (
              <div
                className="space-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3"
                data-testid="home-practice-recommendation"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
                  {t("practice.missionRecommendations.badge")}
                </p>
                <p className="text-base font-semibold text-slate-100">{t(homePracticeMission.title)}</p>
                {homePracticeRecommendationReason ? (
                  <p className="text-sm text-emerald-200">{homePracticeRecommendationReason}</p>
                ) : null}
                <button
                  type="button"
                  onClick={handlePracticeRecommendationClick}
                  className="mt-2 inline-flex items-center rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400"
                  data-testid="home-practice-recommendation-cta"
                >
                  {t("home_dashboard_practice_next_cta")}
                </button>
              </div>
            ) : null}
            {shouldRenderWeeklyGoalNudge && weeklyGoalNudgeCopy ? (
              <div
                className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-50"
                data-testid="practice-goal-nudge"
              >
                <div className="font-semibold text-emerald-100">{weeklyGoalNudgeCopy}</div>
                <Link
                  to={{ pathname: "/practice/missions", search: "?source=home_goal_nudge" }}
                  className="text-emerald-200 underline-offset-2 hover:text-emerald-100 hover:underline"
                  onClick={handleGoalNudgeClick}
                  data-testid="practice-goal-nudge-cta"
                >
                  {t("practice.missions.cta.viewAll")}
                </Link>
              </div>
            ) : null}
          </div>
        </Card>

        <Card
          title={t("home.profile.title")}
          subtitle={t("home.profile.subtitle")}
          action={
            <Link
              to="/profile"
              className="inline-flex items-center justify-center rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-white"
            >
              {t("home.profile.button")}
            </Link>
          }
          footer={<div className="text-xs text-slate-400">{t("home.profile.metricsPlaceholder")}</div>}
        />

        {isPro ? (
          <Card
            title={t("home.pro.title")}
            subtitle={t("home.pro.subtitle")}
            action={
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200">
                {t("access.plan.pro")}
              </div>
            }
          >
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-300">
              <li>{t("home.pro.unlocked.caddie")}</li>
              <li>{t("home.pro.unlocked.sg")}</li>
              <li>{t("home.pro.unlocked.range")}</li>
            </ul>
          </Card>
        ) : (
          <UpgradeGate feature="CADDIE_INSIGHTS">
            <Card
              title={t("home.pro.title")}
              subtitle={t("home.pro.subtitle")}
              action={
                <Link
                  to="/profile"
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-400"
                >
                  {t("home.pro.button")}
                </Link>
              }
            >
              <div className="space-y-1 text-xs text-slate-300">
                <div>• {t("home.pro.feature.caddie")}</div>
                <div>• {t("home.pro.feature.sg")}</div>
                <div>• {t("home.pro.feature.ghost")}</div>
              </div>
            </Card>
          </UpgradeGate>
        )}
      </div>
    </div>
  );
};

export default HomeHubPage;

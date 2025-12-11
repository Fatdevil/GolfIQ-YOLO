import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { fetchBagStats } from "@/api/bagStatsClient";
import { mapBagStateToPlayerBag } from "@/bag/utils";
import { loadBag } from "@/bag/storage";
import type { BagState } from "@/bag/types";
import { PRACTICE_MISSION_WINDOW_DAYS, loadPracticeMissionHistory } from "@/practice/practiceMissionHistory";
import {
  buildMissionProgressById,
  buildWeeklyPracticeHistory,
  PRACTICE_WEEK_WINDOW_DAYS,
  type PracticeMissionHistoryEntry,
  type WeeklyPracticeHistorySummary,
} from "@shared/practice/practiceHistory";
import {
  buildPracticeMissionsList,
  type PracticeMissionDefinition,
  type PracticeMissionListItem,
} from "@shared/practice/practiceMissionsList";
import { buildPracticeReadinessSummary } from "@shared/practice/practiceReadiness";
import { buildWeeklyPracticePlanStatus } from "@shared/practice/practicePlan";
import { buildWeeklyPracticeComparison } from "@shared/practice/practiceInsights";
import { buildBagReadinessOverview, type BagReadinessOverview } from "@shared/caddie/bagReadiness";
import type { BagSuggestion } from "@shared/caddie/bagTuningSuggestions";
import {
  trackPracticeMissionStart,
  trackPracticeMissionRecommendationClicked,
  trackPracticeMissionRecommendationShown,
  trackPracticeMissionsViewed,
  trackPracticePlanCompletedViewed,
  trackPracticePlanMissionStart,
  trackPracticePlanViewed,
  trackWeeklyPracticeInsightsViewed,
  trackPracticeWeeklyHistoryViewed,
} from "@/practice/analytics";
import { loadWeeklyPracticeGoalSettings } from "@/practice/practiceGoalSettings";
import { buildPracticeDecisionContext } from "@shared/practice/practiceDecisionContext";
import { recommendPracticeMissions, type RecommendedMission } from "@shared/practice/recommendPracticeMissions";
import { getPracticeRecommendationsExperiment } from "@shared/experiments/flags";
import { getCurrentUserId } from "@/user/currentUserId";

function formatDate(value: number | null, locale: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(locale || undefined, { month: "short", day: "numeric" });
}

function mapSuggestionToMissionDefinition(suggestion: BagSuggestion): PracticeMissionDefinition | null {
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

function MissionCard({
  item,
  onSelect,
  completionLabel,
  completionVariant,
  recommendedReason,
}: {
  item: PracticeMissionListItem;
  onSelect: () => void;
  completionLabel?: string;
  completionVariant?: "complete" | "incomplete";
  recommendedReason?: RecommendedMission["reason"];
}): JSX.Element {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || "en";
  const lastCompletedLabel = useMemo(() => formatDate(item.lastCompletedAt, locale), [item.lastCompletedAt, locale]);
  const sessionsLabel =
    item.completionCount > 0
      ? t("practice.missionProgress.recent", {
          count: item.completionCount,
          days: PRACTICE_MISSION_WINDOW_DAYS,
        })
      : t("practice.missionProgress.empty");
  const title = t(item.title);
  const recommendedReasonLabel = useMemo(() => {
    if (!recommendedReason) return null;
    switch (recommendedReason) {
      case "focus_area":
        return t("practice.missionRecommendations.reason.focus_area");
      case "goal_progress":
        return t("practice.missionRecommendations.reason.goal_progress");
      default:
        return t("practice.missionRecommendations.reason.fallback");
    }
  }, [recommendedReason, t]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-left transition hover:border-emerald-500/60 hover:bg-slate-900"
      data-testid="practice-mission-item"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-base font-semibold text-slate-100">{title}</p>
          <p className="text-sm text-slate-400">{sessionsLabel}</p>
          {lastCompletedLabel ? (
            <p className="text-xs text-slate-500">
              {t("practice.history.detail.endedAt")}: {lastCompletedLabel}
            </p>
          ) : (
            <p className="text-xs text-slate-500">{t("practice.history.detail.unknown")}</p>
          )}
          {recommendedReasonLabel ? (
            <p className="text-xs font-semibold text-emerald-200">{recommendedReasonLabel}</p>
          ) : null}
          {completionLabel ? (
            <p
              className={`text-xs font-semibold ${
                completionVariant === "complete" ? "text-emerald-200" : "text-slate-400"
              }`}
            >
              {completionLabel}
            </p>
          ) : null}
          {item.inStreak ? (
            <p className="text-xs font-semibold text-emerald-200">{t("practice.missionProgress.streak")}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          {recommendedReason ? (
            <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
              {t("practice.missionRecommendations.badge")}
            </span>
          ) : null}
          <span className="inline-flex items-center rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-100">
            {t(item.subtitleKey)}
          </span>
        </div>
      </div>
    </button>
  );
}

type PageState = {
  loading: boolean;
  missions: PracticeMissionListItem[];
  history: PracticeMissionHistoryEntry[];
};

function WeeklyPracticeInsightsCard({
  comparison,
}: {
  comparison: ReturnType<typeof buildWeeklyPracticeComparison>;
}): JSX.Element {
  const { t } = useTranslation();
  const hasHistory =
    comparison.thisWeek.missionsCompleted > 0 || comparison.lastWeek.missionsCompleted > 0;

  if (!hasHistory) {
    return (
      <section
        className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
        data-testid="practice-weekly-insights"
      >
        <p className="text-sm font-semibold text-slate-100">{t("practice.insights.title")}</p>
        <p className="text-sm text-slate-400">{t("practice.insights.empty")}</p>
      </section>
    );
  }

  const renderRow = (label: string, snapshot: typeof comparison.thisWeek, testId: string) => (
    <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-900/40 p-3" data-testid={testId}>
      <p className="text-sm font-semibold text-slate-100">{label}</p>
      <p className="text-xs font-semibold text-emerald-200">
        {snapshot.goalReached
          ? t("practice.insights.goalReached")
          : t("practice.insights.goalNotReached")}
      </p>
      <p className="text-xs font-semibold text-emerald-200">
        {snapshot.planCompleted
          ? t("practice.insights.planCompleted")
          : t("practice.insights.planNotCompleted")}
      </p>
    </div>
  );

  return (
    <section
      className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
      data-testid="practice-weekly-insights"
    >
      <p className="text-sm font-semibold text-slate-100">{t("practice.insights.title")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {renderRow(
          t("practice.insights.thisWeek", { missions: comparison.thisWeek.missionsCompleted }),
          comparison.thisWeek,
          "weekly-insights-this-week",
        )}
        {renderRow(
          t("practice.insights.lastWeek", { missions: comparison.lastWeek.missionsCompleted }),
          comparison.lastWeek,
          "weekly-insights-last-week",
        )}
      </div>
    </section>
  );
}

function formatWeekRange(start: Date, locale: string): { from: string; to: string } {
  const end = new Date(start);
  end.setDate(end.getDate() + PRACTICE_WEEK_WINDOW_DAYS - 1);

  return {
    from: start.toLocaleDateString(locale || undefined, { month: "short", day: "numeric" }),
    to: end.toLocaleDateString(locale || undefined, { month: "short", day: "numeric" }),
  };
}

function WeeklyHistorySection({ summaries }: { summaries: WeeklyPracticeHistorySummary[] }): JSX.Element {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || "en";

  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4" data-testid="practice-weekly-history">
      <p className="text-sm font-semibold text-slate-100">{t("practice.history.weekly.title")}</p>
      {summaries.length === 0 ? (
        <p className="text-sm text-slate-400">{t("practice.history.weekly.empty")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {summaries.map((summary, index) => {
            const { from, to } = formatWeekRange(summary.weekStart, locale);
            const label =
              index === 0
                ? t("practice.history.weekly.thisWeek")
                : index === 1
                  ? t("practice.history.weekly.lastWeek")
                  : t("practice.history.weekly.range", { from, to });

            return (
              <div
                key={summary.weekStart.getTime()}
                className="space-y-1 rounded-lg border border-slate-800 bg-slate-900/40 p-3"
                data-testid={`weekly-history-item-${index}`}
              >
                <p className="text-sm font-semibold text-slate-100">{label}</p>
                <p className="text-xs font-semibold text-emerald-200">
                  {t("practice.history.weekly.counts", {
                    completed: summary.completedCount,
                    target: summary.target,
                  })}
                </p>
                <p className="text-xs font-semibold text-emerald-200">
                  {summary.goalReached
                    ? t("practice.history.weekly.goalReached")
                    : t("practice.history.weekly.goalNotReached")}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function PracticeMissionsPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [bag] = useState<BagState>(() => loadBag());
  const [{ missions, history, loading }, setState] = useState<PageState>({ loading: true, missions: [], history: [] });
  const [weeklyGoalSettings] = useState(loadWeeklyPracticeGoalSettings);
  const viewedRef = useRef(false);
  const planViewedRef = useRef(false);
  const planCompletedViewedRef = useRef(false);
  const insightsViewedRef = useRef(false);
  const historyViewedRef = useRef(false);

  const experimentUserId = getCurrentUserId() ?? "anonymous";
  const practiceRecommendationsExperiment = useMemo(
    () => getPracticeRecommendationsExperiment(experimentUserId),
    [experimentUserId],
  );

  const targetMissionsPerWeek = weeklyGoalSettings.targetMissionsPerWeek;

  const practiceReadinessSummary = useMemo(
    () => buildPracticeReadinessSummary({ history, goalSettings: weeklyGoalSettings }),
    [history, weeklyGoalSettings],
  );

  const practiceDecisionContext = useMemo(
    () => buildPracticeDecisionContext({ summary: practiceReadinessSummary }),
    [practiceReadinessSummary],
  );

  const practiceRecommendations = useMemo(
    () =>
      loading || !practiceRecommendationsExperiment.enabled
        ? []
        : recommendPracticeMissions({
            context: practiceDecisionContext,
            missions: missions.map((mission) => ({ id: mission.id, focusArea: (mission as any).focusArea })),
            maxResults: 3,
          }),
    [
      loading,
      missions,
      practiceDecisionContext,
      practiceRecommendationsExperiment.enabled,
    ],
  );

  const recommendationByMissionId = useMemo(() => {
    const map = new Map<string, RecommendedMission>();
    if (practiceRecommendationsExperiment.enabled) {
      practiceRecommendations.forEach((rec) => map.set(rec.id, rec));
    }
    return map;
  }, [practiceRecommendations, practiceRecommendationsExperiment.enabled, missions]);

  const recommendationImpressionsSentRef = useRef(new Set<string>());

  const weeklyPlanStatus = useMemo(
    () =>
      buildWeeklyPracticePlanStatus({
        missions,
        history,
        targetMissionsPerWeek,
      }),
    [history, missions, targetMissionsPerWeek],
  );

  const weeklyComparison = useMemo(
    () => buildWeeklyPracticeComparison({ history, missions, targetMissionsPerWeek }),
    [history, missions, targetMissionsPerWeek],
  );

  const weeklyHistory = useMemo(
    () =>
      buildWeeklyPracticeHistory({
        history,
        settings: weeklyGoalSettings,
        now: new Date(),
      }),
    [history, weeklyGoalSettings],
  );

  const weeklyPlanMissions = weeklyPlanStatus.missions;
  const weeklyPlanIds = useMemo(() => new Set(weeklyPlanMissions.map((mission) => mission.id)), [weeklyPlanMissions]);
  const remainingMissions = useMemo(
    () => missions.filter((mission) => !weeklyPlanIds.has(mission.id)),
    [missions, weeklyPlanIds],
  );

  useEffect(() => {
    if (loading || practiceRecommendations.length === 0 || !practiceRecommendationsExperiment.enabled) return;

    practiceRecommendations.forEach((rec) => {
      if (recommendationImpressionsSentRef.current.has(rec.id)) return;
      const mission = missions.find((candidate) => candidate.id === rec.id);
      trackPracticeMissionRecommendationShown({
        missionId: rec.id,
        reason: rec.reason,
        rank: rec.rank,
        surface: "web_practice_missions",
        focusArea: (mission as any)?.focusArea,
        algorithmVersion: "v1",
        experiment: {
          experimentKey: practiceRecommendationsExperiment.experimentKey,
          experimentBucket: practiceRecommendationsExperiment.experimentBucket,
          experimentVariant: practiceRecommendationsExperiment.experimentVariant,
        },
      });
      recommendationImpressionsSentRef.current.add(rec.id);
    });
  }, [
    loading,
    missions,
    practiceRecommendations,
    practiceRecommendationsExperiment.enabled,
    practiceRecommendationsExperiment.experimentBucket,
    practiceRecommendationsExperiment.experimentKey,
    practiceRecommendationsExperiment.experimentVariant,
  ]);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    const sourceParam = new URLSearchParams(location.search).get("source");
    const source = sourceParam === "home_hub" ? "home_hub" : "other";
    trackPracticeMissionsViewed({ surface: "web", source });
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const historyPromise = loadPracticeMissionHistory();
        const bagStatsPromise = fetchBagStats().catch(() => null);

        const [historyEntries, bagStats] = await Promise.all([historyPromise, bagStatsPromise]);
        if (cancelled) return;

        const playerBag = mapBagStateToPlayerBag(bag);
        const bagReadiness = playerBag ? buildBagReadinessOverview(playerBag, bagStats ?? {}) : null;
        const missions = buildMissionDefinitions(bagReadiness, historyEntries);
        const missionProgressById = buildMissionProgressById(
          historyEntries,
          missions.map((mission) => mission.id),
          { windowDays: PRACTICE_MISSION_WINDOW_DAYS },
        );

        const prioritizedMissions = buildPracticeMissionsList({
          bagReadiness,
          missionProgressById,
          missions,
        });

        setState({ loading: false, missions: prioritizedMissions, history: historyEntries });
      } catch (err) {
        if (!cancelled) {
          console.warn("[practice] Failed to load missions", err);
          setState({ loading: false, missions: [], history: [] });
        }
      }
    };

    load().catch((err) => console.warn("[practice] missions page crashed", err));

    return () => {
      cancelled = true;
    };
  }, [bag]);

  useEffect(() => {
    if (loading || weeklyPlanStatus.totalCount === 0 || planViewedRef.current) return;
    planViewedRef.current = true;
    trackPracticePlanViewed({
      entryPoint: "practice_missions",
      missionsInPlan: weeklyPlanStatus.totalCount,
      targetMissionsPerWeek,
    });
  }, [loading, targetMissionsPerWeek, weeklyPlanStatus.totalCount]);

  useEffect(() => {
    if (loading || !weeklyPlanStatus.isPlanCompleted || planCompletedViewedRef.current) return;
    planCompletedViewedRef.current = true;
    trackPracticePlanCompletedViewed({
      entryPoint: "practice_missions",
      completedMissions: weeklyPlanStatus.completedCount,
      totalMissions: weeklyPlanStatus.totalCount,
      isPlanCompleted: weeklyPlanStatus.isPlanCompleted,
      targetMissionsPerWeek,
    });
  }, [loading, targetMissionsPerWeek, weeklyPlanStatus]);

  useEffect(() => {
    if (loading || insightsViewedRef.current) return;
    insightsViewedRef.current = true;

    trackWeeklyPracticeInsightsViewed({
      thisWeekMissions: weeklyComparison.thisWeek.missionsCompleted,
      lastWeekMissions: weeklyComparison.lastWeek.missionsCompleted,
      thisWeekGoalReached: weeklyComparison.thisWeek.goalReached,
      lastWeekGoalReached: weeklyComparison.lastWeek.goalReached,
      thisWeekPlanCompleted: weeklyComparison.thisWeek.planCompleted,
      lastWeekPlanCompleted: weeklyComparison.lastWeek.planCompleted,
      surface: "practice_missions_web",
      targetMissionsPerWeek,
    });
  }, [loading, targetMissionsPerWeek, weeklyComparison]);

  useEffect(() => {
    if (loading || historyViewedRef.current) return;
    historyViewedRef.current = true;

    trackPracticeWeeklyHistoryViewed({ surface: "web_practice_missions", weeks: weeklyHistory.length });
  }, [loading, weeklyHistory.length]);

  const handleSelectMission = (missionId: string, planRank?: number) => {
    const recommendation = recommendationByMissionId.get(missionId);
    const mission = missions.find((candidate) => candidate.id === missionId);

    if (recommendation && practiceRecommendationsExperiment.enabled) {
      trackPracticeMissionRecommendationClicked({
        missionId,
        reason: recommendation.reason,
        rank: recommendation.rank,
        surface: "web_practice_missions",
        entryPoint: planRank != null ? "weekly_plan" : "missions_list",
        focusArea: (mission as any)?.focusArea,
        algorithmVersion: "v1",
        experiment: {
          experimentKey: practiceRecommendationsExperiment.experimentKey,
          experimentBucket: practiceRecommendationsExperiment.experimentBucket,
          experimentVariant: practiceRecommendationsExperiment.experimentVariant,
        },
      });
    }

    if (planRank != null) {
      trackPracticePlanMissionStart({
        entryPoint: "practice_missions",
        missionId,
        planRank,
      });
    }

    const latestEntry = [...history]
      .filter((entry) => entry.missionId === missionId)
      .sort((a, b) => new Date(b.endedAt ?? b.startedAt ?? 0).getTime() - new Date(a.endedAt ?? a.startedAt ?? 0).getTime())[0];

    if (latestEntry) {
      navigate(`/practice/history/${latestEntry.id}`);
      return;
    }

    const params = new URLSearchParams();
    params.set("missionId", missionId);
    trackPracticeMissionStart({ missionId, sourceSurface: "missions_page" });
    navigate(`/range/practice?${params.toString()}`);
  };

  return (
    <div className="space-y-4" data-testid="practice-missions-page">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/80">GolfIQ</p>
        <h1 className="text-2xl font-semibold text-slate-50">{t("practice.missions.title")}</h1>
        <p className="text-sm text-slate-400">{t("practice.history.subtitle")}</p>
      </header>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300" data-testid="practice-missions-loading">
          {t("practice.history.loading")}
        </div>
      ) : (
        <div className="space-y-5">
          <WeeklyPracticeInsightsCard comparison={weeklyComparison} />
          <WeeklyHistorySection summaries={weeklyHistory} />
          {missions.length === 0 ? (
            <div className="space-y-3 rounded-xl border border-dashed border-slate-800 bg-slate-900/60 p-6" data-testid="practice-missions-empty">
              <h2 className="text-lg font-semibold text-slate-50">{t("practice.missions.empty.title")}</h2>
              <p className="text-sm text-slate-400">{t("practice.missions.empty.body")}</p>
              <button
                type="button"
                onClick={() => navigate("/range/practice?entrySource=missions")}
                className="inline-flex w-full justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-400 sm:w-auto"
              >
                {t("home.range.button")}
              </button>
            </div>
          ) : (
            <div className="space-y-5" data-testid="practice-missions-list">
              {weeklyPlanMissions.length > 0 ? (
                <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4" data-testid="practice-weekly-plan">
                  <header className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-200/70">
                        {t("practice.plan.title")}
                      </p>
                      <p className="text-xs text-slate-400">{t("practice.history.subtitle")}</p>
                    </div>
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
                      {t("practice.plan.title")}
                    </span>
                  </header>
                  <div className="space-y-3">
                    {weeklyPlanStatus.totalCount > 0 ? (
                      <div
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          weeklyPlanStatus.isPlanCompleted
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                            : "border-slate-800 bg-slate-800/60 text-slate-200"
                        }`}
                      >
                        {weeklyPlanStatus.isPlanCompleted
                          ? t("practice.plan.completedBanner")
                          : t("practice.plan.progressBanner", {
                              completed: weeklyPlanStatus.completedCount,
                              total: weeklyPlanStatus.totalCount,
                            })}
                      </div>
                    ) : null}
                    {weeklyPlanMissions.map((mission) => (
                      <div key={mission.id} className="space-y-2" data-testid="practice-plan-item">
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                          {t("practice.plan.badge", { rank: mission.planRank })}
                        </span>
                        <MissionCard
                          item={mission}
                          completionLabel={
                            mission.isCompletedThisWeek
                              ? t("practice.plan.completeLabel")
                              : t("practice.plan.incompleteLabel")
                          }
                          completionVariant={mission.isCompletedThisWeek ? "complete" : "incomplete"}
                          recommendedReason={recommendationByMissionId.get(mission.id)?.reason}
                          onSelect={() => handleSelectMission(mission.id, mission.planRank)}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">{t("practice.missions.title")}</p>
                </section>
              ) : null}

              <div className="space-y-3" data-testid="practice-missions-remaining">
                {remainingMissions.map((mission) => (
                  <MissionCard
                    key={mission.id}
                    item={mission}
                    onSelect={() => handleSelectMission(mission.id)}
                    recommendedReason={recommendationByMissionId.get(mission.id)?.reason}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

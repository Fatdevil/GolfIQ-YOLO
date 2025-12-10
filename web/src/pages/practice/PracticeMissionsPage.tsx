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
  type PracticeMissionHistoryEntry,
} from "@shared/practice/practiceHistory";
import {
  buildPracticeMissionsList,
  type PracticeMissionDefinition,
  type PracticeMissionListItem,
} from "@shared/practice/practiceMissionsList";
import { buildWeeklyPracticePlan } from "@shared/practice/practicePlan";
import { buildBagReadinessOverview, type BagReadinessOverview } from "@shared/caddie/bagReadiness";
import type { BagSuggestion } from "@shared/caddie/bagTuningSuggestions";
import {
  trackPracticeMissionStart,
  trackPracticeMissionsViewed,
  trackPracticePlanMissionStart,
  trackPracticePlanViewed,
} from "@/practice/analytics";

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

function MissionCard({ item, onSelect }: { item: PracticeMissionListItem; onSelect: () => void }): JSX.Element {
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
          {item.inStreak ? (
            <p className="text-xs font-semibold text-emerald-200">{t("practice.missionProgress.streak")}</p>
          ) : null}
        </div>
        <span className="inline-flex items-center rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-100">
          {t(item.subtitleKey)}
        </span>
      </div>
    </button>
  );
}

type PageState = {
  loading: boolean;
  missions: PracticeMissionListItem[];
  history: PracticeMissionHistoryEntry[];
};

export default function PracticeMissionsPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [bag] = useState<BagState>(() => loadBag());
  const [{ missions, history, loading }, setState] = useState<PageState>({ loading: true, missions: [], history: [] });
  const viewedRef = useRef(false);
  const planViewedRef = useRef(false);

  const weeklyPlanMissions = useMemo(() => buildWeeklyPracticePlan(missions), [missions]);
  const weeklyPlanIds = useMemo(() => new Set(weeklyPlanMissions.map((mission) => mission.id)), [weeklyPlanMissions]);
  const remainingMissions = useMemo(
    () => missions.filter((mission) => !weeklyPlanIds.has(mission.id)),
    [missions, weeklyPlanIds],
  );

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

        if (prioritizedMissions.length > 0 && !planViewedRef.current) {
          const planMissions = buildWeeklyPracticePlan(prioritizedMissions);
          if (planMissions.length > 0) {
            planViewedRef.current = true;
            trackPracticePlanViewed({
              entryPoint: "practice_missions",
              missionsInPlan: planMissions.length,
            });
          }
        }

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

  const handleSelectMission = (missionId: string, planRank?: number) => {
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
      ) : missions.length === 0 ? (
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
                {weeklyPlanMissions.map((mission) => (
                  <div key={mission.id} className="space-y-2" data-testid="practice-plan-item">
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                      {t("practice.plan.badge", { rank: mission.planRank })}
                    </span>
                    <MissionCard item={mission} onSelect={() => handleSelectMission(mission.id, mission.planRank)} />
                  </div>
                ))}
              </div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">{t("practice.missions.title")}</p>
            </section>
          ) : null}

          <div className="space-y-3" data-testid="practice-missions-remaining">
            {remainingMissions.map((mission) => (
              <MissionCard key={mission.id} item={mission} onSelect={() => handleSelectMission(mission.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

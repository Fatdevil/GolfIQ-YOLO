import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { UpgradeGate } from "@/access/UpgradeGate";
import { useAccessPlan } from "@/access/UserAccessContext";
import { fetchPlayerAnalytics, type PlayerAnalytics } from "@/api/analytics";
import { useDemoMode } from "@/demo/DemoContext";
import {
  trackPracticeMissionRecommendationClicked,
  trackPracticeMissionRecommendationShown,
} from "@/practice/analytics";
import type { PracticeRecommendationContext } from "@shared/practice/practiceRecommendationsAnalytics";
import {
  buildStrokesGainedLightTrend,
  type StrokesGainedLightCategory,
  type StrokesGainedLightTrend,
} from "@shared/stats/strokesGainedLight";

import { PlayerAnalyticsDashboard } from "./PlayerAnalyticsDashboard";

type LoadState = "idle" | "loading" | "ready" | "error";

type Props = {
  demoMode?: boolean;
  demoAnalytics?: PlayerAnalytics | null;
  loadingDemo?: boolean;
};

export function PlayerAnalyticsSection({
  demoMode = false,
  demoAnalytics,
  loadingDemo = false,
}: Props) {
  const { isPro, loading } = useAccessPlan();
  const [analytics, setAnalytics] = useState<PlayerAnalytics | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const effectiveDemo = demoMode || useDemoMode().demoMode;
  const sgLightImpressionSent = useRef(false);

  useEffect(() => {
    if (effectiveDemo) {
      setAnalytics(demoAnalytics ?? null);
      setState(loadingDemo ? "loading" : demoAnalytics ? "ready" : "idle");
      return;
    }

    if (loading || !isPro) {
      setAnalytics(null);
      setState("idle");
      return;
    }

    let cancelled = false;
    setState("loading");

    fetchPlayerAnalytics()
      .then((data) => {
        if (cancelled) return;
        setAnalytics(data);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [demoAnalytics, effectiveDemo, isPro, loading, loadingDemo]);

  const sgLightTrend = useMemo<StrokesGainedLightTrend | null>(() => {
    if (!analytics) return null;
    if (analytics.strokesGainedLightTrend) return analytics.strokesGainedLightTrend;
    if (!analytics.strokesGainedLightRounds?.length) return null;

    const orderedRounds = [...analytics.strokesGainedLightRounds].sort(
      (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
    );

    return (
      buildStrokesGainedLightTrend(orderedRounds, { windowSize: 5 }) ?? null
    );
  }, [analytics]);

  const sgLightFocusCategory = sgLightTrend?.focusHistory?.[0]?.focusCategory ?? null;

  useEffect(() => {
    if (!sgLightTrend || !sgLightFocusCategory || sgLightImpressionSent.current)
      return;

    sgLightImpressionSent.current = true;
    trackPracticeMissionRecommendationShown({
      missionId: "sg_light_focus",
      reason: "focus_area",
      rank: 1,
      surface: "web_stats_sg_light_trend",
      focusArea: mapSgLightCategoryToFocusArea(sgLightFocusCategory),
      origin: "web_stats_sg_light_trend",
      strokesGainedLightFocusCategory: sgLightFocusCategory,
    });
  }, [sgLightFocusCategory, sgLightTrend]);

  const sgLightPracticeLink = useMemo(() => {
    if (!sgLightFocusCategory) return null;

    const recommendation: PracticeRecommendationContext = {
      source: "practice_recommendations",
      focusArea: mapSgLightCategoryToFocusArea(sgLightFocusCategory),
      reasonKey: "sg_light_focus",
      origin: "web_stats_sg_light_trend",
      strokesGainedLightFocusCategory: sgLightFocusCategory,
      surface: "web_stats_sg_light_trend",
    };

    const params = new URLSearchParams();
    params.set("source", "web_stats_sg_light_trend");
    params.set("recommendation", JSON.stringify(recommendation));
    return `/range/practice?${params.toString()}`;
  }, [sgLightFocusCategory]);

  const handleSgLightPracticeClick = useCallback(() => {
    if (!sgLightFocusCategory) return;
    trackPracticeMissionRecommendationClicked({
      missionId: "sg_light_focus",
      reason: "focus_area",
      rank: 1,
      surface: "web_stats_sg_light_trend",
      entryPoint: "sg_light_focus_card",
      focusArea: mapSgLightCategoryToFocusArea(sgLightFocusCategory),
      origin: "web_stats_sg_light_trend",
      strokesGainedLightFocusCategory: sgLightFocusCategory,
    });
  }, [sgLightFocusCategory]);

  const content = (() => {
    if (loading) return <p className="text-xs text-slate-400">Checking access…</p>;
    if (!isPro && !effectiveDemo)
      return (
        <UpgradeGate feature="PLAYER_ANALYTICS">
          <div className="text-sm text-slate-300 space-y-2">
            <p>Unlock personalised strokes-gained insights, category focus, and mission progress.</p>
            <p className="text-xs text-slate-500">Upgrade to Pro to activate analytics.</p>
          </div>
        </UpgradeGate>
      );

    if (state === "loading") return <p className="text-xs text-slate-400">Loading analytics…</p>;
    if (state === "error")
      return <p className="text-xs text-amber-400">Could not load analytics right now.</p>;
    if (state === "ready" && analytics)
      return (
        <PlayerAnalyticsDashboard
          analytics={analytics}
          sgLightTrend={sgLightTrend}
          sgLightPracticeHref={sgLightPracticeLink ?? undefined}
          onSgLightPracticeClick={handleSgLightPracticeClick}
        />
      );

    return <p className="text-xs text-slate-400">No analytics available yet.</p>;
  })();

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Player analytics</h2>
          <p className="text-xs text-slate-400">Recent SG trends, category focus, and mission progress.</p>
        </div>
      </div>
      {content}
    </section>
  );
}

function mapSgLightCategoryToFocusArea(
  category: StrokesGainedLightCategory,
): string {
  if (category === "tee") return "driving";
  if (category === "approach") return "approach";
  if (category === "short_game") return "short_game";
  if (category === "putting") return "putting";
  return category;
}

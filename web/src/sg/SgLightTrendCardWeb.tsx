import React, { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  buildStrokesGainedLightTrend,
  type StrokesGainedLightCategory,
  type StrokesGainedLightSummary,
  type StrokesGainedLightTrend,
} from "@shared/stats/strokesGainedLight";

import { formatSgDelta, labelForSgLightCategory, mapSgLightCategoryToFocusArea } from "./sgLightWebUtils";
import { trackPracticeMissionRecommendationClicked, trackPracticeMissionRecommendationShown } from "@/practice/analytics";

type Props = {
  rounds?: Array<StrokesGainedLightSummary & { roundId?: string; playedAt?: string }>;
  trend?: StrokesGainedLightTrend | null;
  practiceSurface?: "web_round_recap" | "web_round_story";
  practiceHrefBuilder?(focusCategory: StrokesGainedLightCategory): string | null;
};

export function SgLightTrendCardWeb({ rounds, trend, practiceSurface = "web_round_story", practiceHrefBuilder }: Props) {
  const { t } = useTranslation();
  const hasTrackedImpressionRef = useRef(false);

  const resolvedTrend = useMemo(() => {
    if (trend) return trend;
    if (!rounds?.length) return null;
    const ordered = [...rounds].sort((a, b) => new Date(b.playedAt ?? 0).getTime() - new Date(a.playedAt ?? 0).getTime());
    return buildStrokesGainedLightTrend(ordered, { windowSize: 5 });
  }, [rounds, trend]);

  const focusCategory = resolvedTrend?.focusHistory?.[0]?.focusCategory ?? null;
  const practiceHref = useMemo(() => {
    if (!focusCategory || !practiceHrefBuilder) return null;
    return practiceHrefBuilder(focusCategory);
  }, [focusCategory, practiceHrefBuilder]);

  useEffect(() => {
    if (!focusCategory || !practiceHref) return;
    if (hasTrackedImpressionRef.current) return;

    trackPracticeMissionRecommendationShown({
      missionId: "sg_light_focus",
      reason: "focus_area",
      rank: 1,
      surface: practiceSurface,
      focusArea: mapSgLightCategoryToFocusArea(focusCategory),
      origin: practiceSurface,
      strokesGainedLightFocusCategory: focusCategory,
    });
    hasTrackedImpressionRef.current = true;
  }, [focusCategory, practiceHref, practiceSurface]);

  const handlePracticeClick = () => {
    if (!focusCategory) return;
    trackPracticeMissionRecommendationClicked({
      missionId: "sg_light_focus",
      reason: "focus_area",
      rank: 1,
      surface: practiceSurface,
      entryPoint: "sg_light_focus_card",
      focusArea: mapSgLightCategoryToFocusArea(focusCategory),
      origin: practiceSurface,
      strokesGainedLightFocusCategory: focusCategory,
    });
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-100">{t("round.story.sg_light.title", "Recent SG Light trend")}</p>
        <span className="text-[11px] text-slate-500">
          {resolvedTrend ? t("round.story.sg_light.window", { rounds: resolvedTrend.windowSize }) : null}
        </span>
      </div>

      {!resolvedTrend ? (
        <p className="text-xs text-slate-400 mt-2">{t("round.story.sg_light.empty", "Not enough rounds for a trend yet.")}</p>
      ) : (
        <div className="mt-3 space-y-3" data-testid="sg-light-trend-card">
          {focusCategory ? (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  {t("round.story.sg_light.focus", { focus: labelForSgLightCategory(focusCategory, t) })}
                </p>
                <p className="text-xs text-slate-400">
                  {t("round.story.sg_light.subtitle", { rounds: resolvedTrend.windowSize })}
                </p>
              </div>
              <p className="text-sm font-semibold text-emerald-200">
                {formatSgDelta(resolvedTrend.perCategory?.[focusCategory]?.avgDelta)}
              </p>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(resolvedTrend.perCategory).map(([key, entry]) => (
              <div
                key={key}
                className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 flex items-center justify-between"
              >
                <p className="text-xs font-semibold text-slate-100">{labelForSgLightCategory(key as StrokesGainedLightCategory, t)}</p>
                <p className="text-xs font-semibold text-slate-200">{formatSgDelta(entry.avgDelta)}</p>
              </div>
            ))}
          </div>

          {resolvedTrend.focusHistory?.length ? (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-400">{t("round.story.sg_light.focus_history", "Recent focus history")}</p>
              <div className="flex flex-wrap gap-2">
                {resolvedTrend.focusHistory.slice(0, 5).map((entry) => (
                  <span
                    key={entry.roundId}
                    className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-slate-100"
                  >
                    {labelForSgLightCategory(entry.focusCategory, t)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {practiceHref && focusCategory ? (
            <div>
              <a
                href={practiceHref}
                onClick={handlePracticeClick}
                className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
                data-testid="sg-light-trend-practice-cta"
              >
                {t("round.story.sg_light.practice_cta", "Practice this focus")}
              </a>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

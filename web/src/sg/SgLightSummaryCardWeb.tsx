import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  STROKES_GAINED_LIGHT_MIN_CONFIDENCE,
  type StrokesGainedLightCategory,
  type StrokesGainedLightSummary,
} from "@shared/stats/strokesGainedLight";
import { buildSgLightImpressionKey, type SgLightPracticeSurface } from "@shared/sgLight/analytics";

import {
  formatSgDelta,
  isValidSgLightSummary,
  labelForSgLightCategory,
  mapSgLightCategoryToFocusArea,
} from "./sgLightWebUtils";
import {
  trackPracticeMissionRecommendationClicked,
  trackPracticeMissionRecommendationShown,
} from "@/practice/analytics";
import type { PracticeRecommendationContext } from "@shared/practice/practiceRecommendationsAnalytics";
import { SgLightExplainer } from "./SgLightExplainer";
import type { SgLightExplainerSurface } from "./analytics";
import { useTrackOncePerKey } from "@/hooks/useTrackOncePerKey";

type Props = {
  summary?: StrokesGainedLightSummary | null;
  practiceSurface?: SgLightPracticeSurface;
  practiceHrefBuilder?(focusCategory: StrokesGainedLightCategory): string | null;
  explainerSurface?: Extract<
    SgLightExplainerSurface,
    "round_recap" | "round_share" | "round_story" | "player_stats"
  >;
  roundId?: string | null;
  shareId?: string | null;
  impressionKey?: string | null;
};

export function SgLightSummaryCardWeb({
  summary,
  practiceSurface = "web_round_recap",
  practiceHrefBuilder,
  explainerSurface = "round_recap",
  roundId,
  shareId,
  impressionKey,
}: Props) {
  const { t } = useTranslation();
  const eligibleCategories = summary?.byCategory?.filter(
    (entry) => entry.confidence >= STROKES_GAINED_LIGHT_MIN_CONFIDENCE,
  );
  const hasData = Boolean(
    eligibleCategories &&
      eligibleCategories.length > 0 &&
      summary?.byCategory?.length &&
      eligibleCategories.length === summary.byCategory.length,
  );
  const focusCategory = hasData ? summary?.focusCategory ?? null : null;
  const hasReliableFocus = Boolean(focusCategory && hasData);
  const practiceHref = useMemo(() => {
    if (!hasReliableFocus || !practiceHrefBuilder || !focusCategory) return null;
    return practiceHrefBuilder(focusCategory);
  }, [focusCategory, hasReliableFocus, practiceHrefBuilder]);

  const recommendation: PracticeRecommendationContext | null = useMemo(() => {
    if (!focusCategory || !practiceHref) return null;
    return {
      source: "practice_recommendations",
      focusArea: mapSgLightCategoryToFocusArea(focusCategory),
      reasonKey: "sg_light_focus",
      origin: practiceSurface,
      strokesGainedLightFocusCategory: focusCategory,
      surface: practiceSurface,
    };
  }, [focusCategory, practiceHref, practiceSurface]);

  const resolvedImpressionKey = useMemo(() => {
    if (!focusCategory || !practiceHref) return null;
    if (impressionKey) return impressionKey;
    const contextId = roundId ?? shareId ?? "unknown";
    return buildSgLightImpressionKey({
      surface: practiceSurface,
      contextId,
      cardType: "summary",
    });
  }, [focusCategory, impressionKey, practiceHref, practiceSurface, roundId, shareId]);

  const { fire: fireImpressionOnce } = useTrackOncePerKey(resolvedImpressionKey);

  useEffect(() => {
    if (!focusCategory || !recommendation) return;
    fireImpressionOnce(() => {
      trackPracticeMissionRecommendationShown({
        missionId: "sg_light_focus",
        reason: "focus_area",
        rank: 1,
        surface: practiceSurface,
        focusArea: recommendation.focusArea,
        origin: practiceSurface,
        strokesGainedLightFocusCategory: focusCategory,
      });
    });
  }, [fireImpressionOnce, focusCategory, practiceSurface, recommendation]);

  const handlePracticeClick = () => {
    if (!focusCategory || !recommendation) return;
    trackPracticeMissionRecommendationClicked({
      missionId: "sg_light_focus",
      reason: "focus_area",
      rank: 1,
      surface: practiceSurface,
      entryPoint: "sg_light_focus_card",
      focusArea: recommendation.focusArea,
      origin: practiceSurface,
      strokesGainedLightFocusCategory: focusCategory,
    });
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-100">{t("round.recap.sg_light.title", "Strokes Gained Light")}</p>
            <p className="text-xs text-slate-400">{t("round.recap.sg_light.subtitle", "Focus from this round")}</p>
          </div>
          <SgLightExplainer surface={explainerSurface} />
        </div>
        {hasData ? (
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{t("round.recap.sg_light.total", "Total")}</p>
            <p className="text-lg font-semibold text-emerald-200">{formatSgDelta(summary?.totalDelta)}</p>
          </div>
        ) : null}
      </div>

      {!hasData ? (
        <p className="mt-3 text-sm text-slate-400">
          {t("round.recap.sg_light.empty", "Not enough strokes-gained data yet for this round.")}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {focusCategory ? (
            <div className="rounded-lg border border-emerald-700/40 bg-emerald-900/30 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-emerald-200/70">
                {t("round.recap.sg_light.focus", "Focus this round")}
              </p>
              <p className="text-sm font-semibold text-emerald-50">{labelForSgLightCategory(focusCategory, t)}</p>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            {summary?.byCategory?.map((entry) => {
              const lowConfidence = entry.confidence < STROKES_GAINED_LIGHT_MIN_CONFIDENCE;
              const emphasis = focusCategory === entry.category;
              return (
                <div
                  key={entry.category}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                    emphasis
                      ? "border-emerald-500/50 bg-emerald-900/40"
                      : "border-slate-800 bg-slate-950/50"
                  }`}
                  data-testid={`sg-light-category-${entry.category}`}
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-100">{labelForSgLightCategory(entry.category, t)}</p>
                    <p className="text-[11px] text-slate-500">{t("share.sg_light.shots", { count: entry.shots })}</p>
                    {lowConfidence ? (
                      <p className="text-[11px] text-amber-300">{t("round.recap.sg_light.low_confidence", "Low confidence")}</p>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-slate-200">{formatSgDelta(entry.delta)}</p>
                </div>
              );
            })}
          </div>

          {hasReliableFocus && practiceHref && focusCategory ? (
            <div>
              <a
                href={practiceHref}
                onClick={handlePracticeClick}
                className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
                data-testid="sg-light-practice-cta"
              >
                {t("round.recap.sg_light.practice_cta", "Practice this focus")}
              </a>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

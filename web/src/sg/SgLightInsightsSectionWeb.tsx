import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { SgLightSummaryCardWeb } from "@/sg/SgLightSummaryCardWeb";
import { SgLightTrendCardWeb } from "@/sg/SgLightTrendCardWeb";
import { useTrackOncePerKey } from "@/hooks/useTrackOncePerKey";
import {
  trackPracticeMissionRecommendationClicked,
  trackPracticeMissionRecommendationShown,
} from "@/practice/analytics";
import {
  formatSgDelta,
  isValidSgLightSummary,
  labelForSgLightCategory,
  mapSgLightCategoryToFocusArea,
} from "@/sg/sgLightWebUtils";
import type {
  StrokesGainedLightCategory,
  StrokesGainedLightSummary,
  StrokesGainedLightTrend,
} from "@shared/stats/strokesGainedLight";

const PRACTICE_SURFACE_BY_SURFACE = {
  round_recap: "web_round_recap",
  round_story: "web_round_story",
  round_share: "web_round_share",
} as const;

const EXPLAINER_SURFACE_BY_SURFACE = {
  round_recap: "round_recap",
  round_story: "round_story",
  round_share: "round_share",
} as const;

type Props = {
  surface: "round_recap" | "round_story" | "round_share";
  contextId?: string | null;
  sgLightSummary?: StrokesGainedLightSummary | null;
  sgLightTrend?: StrokesGainedLightTrend | null;
  rounds?: Array<StrokesGainedLightSummary & { roundId?: string; playedAt?: string }> | null;
  practiceHrefBuilder?(focusCategory: StrokesGainedLightCategory): string | null;
  showTrend?: boolean;
};

function RoundShareSgLightSummary({
  summary,
  practiceHrefBuilder,
  impressionKey,
}: {
  summary?: StrokesGainedLightSummary | null;
  practiceHrefBuilder?: (focusCategory: StrokesGainedLightCategory) => string | null;
  impressionKey: string | null;
}) {
  const { t } = useTranslation();
  const hasSgLight = useMemo(() => isValidSgLightSummary(summary), [summary]);
  const focusCategory = hasSgLight ? summary?.focusCategory ?? null : null;
  const practiceHref = useMemo(() => {
    if (!focusCategory || !practiceHrefBuilder) return null;
    return practiceHrefBuilder(focusCategory);
  }, [focusCategory, practiceHrefBuilder]);
  const focusArea = useMemo(
    () => (focusCategory ? mapSgLightCategoryToFocusArea(focusCategory) : null),
    [focusCategory],
  );

  const { fire: fireImpressionOnce } = useTrackOncePerKey(
    focusCategory && practiceHref ? impressionKey : null,
  );

  useEffect(() => {
    if (!focusCategory || !practiceHref || !focusArea) return;

    fireImpressionOnce(() => {
      trackPracticeMissionRecommendationShown({
        missionId: "sg_light_focus",
        reason: "focus_area",
        rank: 1,
        surface: "web_round_share",
        focusArea,
        origin: "web_round_share",
        strokesGainedLightFocusCategory: focusCategory,
      });
    });
  }, [fireImpressionOnce, focusArea, focusCategory, practiceHref]);

  const handlePracticeClick = useCallback(() => {
    if (!focusCategory || !focusArea) return;
    trackPracticeMissionRecommendationClicked({
      missionId: "sg_light_focus",
      reason: "focus_area",
      rank: 1,
      surface: "web_round_share",
      entryPoint: "sg_light_focus_card",
      focusArea,
      origin: "web_round_share",
      strokesGainedLightFocusCategory: focusCategory,
    });
  }, [focusArea, focusCategory]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-100">
            {t("share.sg_light.title", "Strokes Gained Light")}
          </p>
          <p className="text-xs text-slate-400">
            {t("share.sg_light.subtitle", "Focus from this round")}
          </p>
        </div>
        {hasSgLight ? (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Total</p>
            <p className="text-lg font-semibold text-emerald-200">
              {formatSgDelta(summary?.totalDelta)}
            </p>
          </div>
        ) : null}
      </div>

      {!hasSgLight ? (
        <p className="mt-3 text-sm text-slate-400">
          {t(
            "share.sg_light.empty",
            "Not enough strokes gained data yet for this round.",
          )}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {focusCategory ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                {t("share.sg_light.focus", "Focus this round")}
              </p>
              <p className="text-sm font-semibold text-slate-100">
                {labelForSgLightCategory(focusCategory, t)}
              </p>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            {summary?.byCategory?.map((entry) => (
              <div
                key={entry.category}
                className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-100">
                    {labelForSgLightCategory(entry.category, t)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {t("share.sg_light.shots", { count: entry.shots })}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-200">
                  {formatSgDelta(entry.delta)}
                </p>
              </div>
            ))}
          </div>

          {practiceHref && focusCategory ? (
            <div>
              <a
                href={practiceHref}
                onClick={handlePracticeClick}
                className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-emerald-400"
                data-testid="share-sg-light-practice-cta"
              >
                {t("stats.player.sg_light.practice_cta")}
              </a>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function SgLightInsightsSectionWeb({
  surface,
  contextId,
  sgLightSummary,
  sgLightTrend,
  rounds,
  practiceHrefBuilder,
  showTrend,
}: Props): JSX.Element | null {
  const allowTrend = showTrend ?? surface !== "round_share";
  const hasSummary = isValidSgLightSummary(sgLightSummary);
  const hasTrend = allowTrend && Boolean(sgLightTrend || rounds?.length);
  const shouldRender = hasSummary || hasTrend || surface === "round_share";

  const contextKey = contextId ?? "unknown";
  const summaryImpressionKey = `sg_light:${surface}:${contextKey}:summary`;
  const trendImpressionKey = `sg_light:${surface}:${contextKey}:trend`;

  if (!shouldRender) return null;

  if (surface === "round_share") {
    return (
      <RoundShareSgLightSummary
        summary={sgLightSummary}
        practiceHrefBuilder={practiceHrefBuilder}
        impressionKey={hasSummary ? summaryImpressionKey : null}
      />
    );
  }

  const practiceSurface = PRACTICE_SURFACE_BY_SURFACE[surface];
  const explainerSurface = EXPLAINER_SURFACE_BY_SURFACE[surface];

  return (
    <>
      {hasSummary ? (
        <SgLightSummaryCardWeb
          summary={sgLightSummary ?? null}
          practiceSurface={practiceSurface}
          practiceHrefBuilder={practiceHrefBuilder}
          explainerSurface={explainerSurface}
          roundId={contextId}
          impressionKey={summaryImpressionKey}
        />
      ) : null}
      {hasTrend ? (
        <SgLightTrendCardWeb
          rounds={rounds ?? undefined}
          trend={sgLightTrend ?? undefined}
          practiceSurface={practiceSurface}
          practiceHrefBuilder={practiceHrefBuilder}
          explainerSurface={explainerSurface}
          roundId={contextId}
          impressionKey={trendImpressionKey}
        />
      ) : null}
    </>
  );
}


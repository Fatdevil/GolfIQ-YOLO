import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { GOLFIQ_DOWNLOAD_URL } from "@/config/shareConfig";
import {
  trackPracticeMissionRecommendationClicked,
  trackPracticeMissionRecommendationShown,
} from "@/practice/analytics";
import type { PracticeRecommendationContext } from "@shared/practice/practiceRecommendationsAnalytics";
import {
  STROKES_GAINED_LIGHT_MIN_CONFIDENCE,
  type StrokesGainedLightCategory,
  type StrokesGainedLightSummary,
} from "@shared/stats/strokesGainedLight";

export type RoundShareData = {
  roundId?: string | null;
  courseName?: string | null;
  score?: number | null;
  toPar?: string | null;
  date?: string | null;
  headline?: string | null;
  highlights?: string[];
  strokesGainedLight?: StrokesGainedLightSummary | null;
};

function formatDate(date?: string | null): string | undefined {
  if (!date) return undefined;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function RoundShareView({ data }: { data: RoundShareData }) {
  const { t } = useTranslation();
  const subtitleParts = [
    typeof data.score === "number" ? `Score: ${data.score}` : null,
    data.toPar ? `(${data.toPar})` : null,
    data.date ? formatDate(data.date) : null,
  ].filter(Boolean);

  const highlights = data.highlights?.filter(Boolean) ?? [];
  const hasSgLight = useMemo(() => isValidSgLightSummary(data.strokesGainedLight), [
    data.strokesGainedLight,
  ]);
  const focusCategory = hasSgLight ? data.strokesGainedLight?.focusCategory ?? null : null;
  const practiceHref = useMemo(() => {
    if (!focusCategory) return null;

    const recommendation: PracticeRecommendationContext = {
      source: "practice_recommendations",
      focusArea: mapSgLightCategoryToFocusArea(focusCategory),
      reasonKey: "sg_light_focus",
      origin: "web_round_share",
      strokesGainedLightFocusCategory: focusCategory,
      surface: "web_round_share",
    };

    const params = new URLSearchParams();
    params.set("source", "web_round_share");
    params.set("recommendation", JSON.stringify(recommendation));
    return `/range/practice?${params.toString()}`;
  }, [focusCategory]);
  const sgLightShown = useRef(false);

  useEffect(() => {
    if (!focusCategory || !practiceHref || sgLightShown.current) return;
    sgLightShown.current = true;
    trackPracticeMissionRecommendationShown({
      missionId: "sg_light_focus",
      reason: "focus_area",
      rank: 1,
      surface: "web_round_share",
      focusArea: mapSgLightCategoryToFocusArea(focusCategory),
      origin: "web_round_share",
      strokesGainedLightFocusCategory: focusCategory,
    });
  }, [focusCategory, practiceHref]);

  const handlePracticeClick = () => {
    if (!focusCategory) return;
    trackPracticeMissionRecommendationClicked({
      missionId: "sg_light_focus",
      reason: "focus_area",
      rank: 1,
      surface: "web_round_share",
      entryPoint: "sg_light_focus_card",
      focusArea: mapSgLightCategoryToFocusArea(focusCategory),
      origin: "web_round_share",
      strokesGainedLightFocusCategory: focusCategory,
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-3xl bg-slate-900/80 p-6 shadow-2xl ring-1 ring-slate-800">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30">
          ⛳
        </div>
        <div>
          <div className="text-sm uppercase tracking-wide text-slate-400">GolfIQ</div>
          <div className="text-lg font-semibold text-slate-50">Round recap</div>
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-50">
          Round at {data.courseName || "your course"}
        </h1>
        {subtitleParts.length > 0 && (
          <p className="text-sm text-slate-300">{subtitleParts.join(" · ")}</p>
        )}
      </div>

      {data.headline && (
        <p className="text-base font-medium text-slate-100">{data.headline}</p>
      )}

      {highlights.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Highlights
          </div>
          <ul className="list-disc space-y-1 pl-5 text-slate-100">
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

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
                {formatSgDelta(data.strokesGainedLight?.totalDelta)}
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
              {data.strokesGainedLight?.byCategory?.map((entry) => (
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

      <div className="mt-2 flex flex-col gap-3">
        <a
          href={GOLFIQ_DOWNLOAD_URL}
          className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-emerald-400"
          target="_blank"
          rel="noreferrer"
        >
          Get GolfIQ for your game
        </a>
        <p className="text-xs text-slate-400">
          GolfIQ helps you track rounds, get strokes-gained insights, and share recaps with friends.
        </p>
      </div>
    </div>
  );
}

function mapSgLightCategoryToFocusArea(category: StrokesGainedLightCategory): string {
  if (category === "tee") return "driving";
  if (category === "approach") return "approach";
  if (category === "short_game") return "short_game";
  if (category === "putting") return "putting";
  return category;
}

function isValidSgLightSummary(summary?: StrokesGainedLightSummary | null): boolean {
  if (!summary || !summary.byCategory?.length) return false;
  return summary.byCategory.every(
    (entry) => entry.confidence >= STROKES_GAINED_LIGHT_MIN_CONFIDENCE,
  );
}

function formatSgDelta(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Number(value.toFixed(1));
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}`;
}

function labelForSgLightCategory(
  category: StrokesGainedLightCategory,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const key = category === "tee" ? "sg_light.focus.off_the_tee" : `sg_light.focus.${category}`;
  return t(key);
}

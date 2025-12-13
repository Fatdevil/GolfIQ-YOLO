import { useCallback } from "react";

import { GOLFIQ_DOWNLOAD_URL } from "@/config/shareConfig";
import { SgLightInsightsSectionWeb } from "@/sg/SgLightInsightsSectionWeb";
import { type StrokesGainedLightCategory, type StrokesGainedLightSummary } from "@shared/stats/strokesGainedLight";
import { mapSgLightCategoryToFocusArea } from "@/sg/sgLightWebUtils";

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
  const subtitleParts = [
    typeof data.score === "number" ? `Score: ${data.score}` : null,
    data.toPar ? `(${data.toPar})` : null,
    data.date ? formatDate(data.date) : null,
  ].filter(Boolean);

  const highlights = data.highlights?.filter(Boolean) ?? [];
  const buildPracticeHref = useCallback(
    (focusCategory: StrokesGainedLightCategory) => {
      const params = new URLSearchParams();
      params.set("source", "web_round_share");
      params.set(
        "recommendation",
        JSON.stringify({
          source: "practice_recommendations",
          focusArea: mapSgLightCategoryToFocusArea(focusCategory),
          reasonKey: "sg_light_focus",
          origin: "web_round_share",
          strokesGainedLightFocusCategory: focusCategory,
          surface: "web_round_share",
        }),
      );

      return `/range/practice?${params.toString()}`;
    },
    [],
  );

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

      <SgLightInsightsSectionWeb
        surface="round_share"
        contextId={data.roundId ?? undefined}
        sgLightSummary={data.strokesGainedLight}
        practiceHrefBuilder={buildPracticeHref}
        showTrend={false}
      />

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


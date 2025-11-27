import { useMemo, useState } from "react";

import type { RoundSgPreview, SgCategory } from "@/api/sgPreview";

const CATEGORY_LABELS: Record<SgCategory, string> = {
  TEE: "Tee",
  APPROACH: "Approach",
  SHORT: "Short game",
  PUTT: "Putting",
};

type Props = {
  status: "idle" | "loading" | "loaded" | "error";
  preview: RoundSgPreview | null;
};

type DerivedHole = {
  hole: number;
  sgTotal: number;
  grossScore: number | null;
  worstCategory: SgCategory | null;
};

function formatSgValue(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const formatted = rounded.toFixed(1);
  return rounded > 0 ? `+${formatted}` : formatted;
}

function classifyTone(value: number): string {
  if (value > 0.3) {
    return "text-emerald-300";
  }
  if (value < -0.3) {
    return "text-rose-300";
  }
  return "text-slate-200";
}

function worstCategoryFromRecord(record: Record<SgCategory, number>): SgCategory | null {
  const entries = Object.entries(record) as [SgCategory, number][];
  if (entries.length === 0) {
    return null;
  }
  return entries.reduce<[SgCategory, number]>((worst, current) => {
    return current[1] < worst[1] ? current : worst;
  }, entries[0])[0];
}

export function SgPreviewCard({ status, preview }: Props) {
  const [showInfo, setShowInfo] = useState(false);

  const derivedHoles = useMemo(() => {
    if (!preview) return [];
    return (preview.holes ?? []).map((hole) => {
      const sgTotal =
        typeof hole.sg_total === "number"
          ? hole.sg_total
          : Object.values(hole.sg_by_cat ?? {}).reduce((sum, value) => sum + value, 0);
      const worstCategory =
        hole.worst_category ?? worstCategoryFromRecord(hole.sg_by_cat ?? {});
      const grossScore = typeof hole.gross_score === "number" ? hole.gross_score : null;
      return {
        hole: hole.hole,
        sgTotal,
        grossScore,
        worstCategory,
      } satisfies DerivedHole;
    });
  }, [preview]);

  const roundWorstCategory = useMemo(() => {
    if (preview?.round_summary?.worst_category) {
      return preview.round_summary.worst_category;
    }
    if (preview?.sg_by_cat) {
      return worstCategoryFromRecord(preview.sg_by_cat);
    }
    return null;
  }, [preview]);

  return (
    <div className="mt-4 space-y-3">
      {status === "error" && (
        <p className="text-xs text-rose-300">Could not load strokes-gained preview.</p>
      )}
      {status === "loading" && (
        <p className="text-xs text-slate-400">Loading strokes-gained preview…</p>
      )}
      {status === "loaded" && preview && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-100">
              Round SG: {formatSgValue(preview.total_sg)}
            </p>
            <div className="flex items-center gap-2">
              {roundWorstCategory && (
                <span className="text-xs text-slate-400">
                  Biggest leak: {CATEGORY_LABELS[roundWorstCategory]}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowInfo((open) => !open)}
                className="rounded border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
              >
                What is SG?
              </button>
            </div>
          </div>
          {showInfo && (
            <div className="rounded border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200">
              Strokes gained (SG) compares your performance to a scratch golfer baseline. Positive SG
              means you gained strokes versus the baseline; negative SG means that phase needs work.
            </div>
          )}
          <div className="overflow-x-auto rounded border border-slate-800 bg-slate-950/40">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
                <tr className="text-left">
                  <th className="px-4 py-3">Hole</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">SG total</th>
                  <th className="px-4 py-3">Worst category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {derivedHoles.map((hole) => (
                  <tr key={hole.hole} className="text-slate-200">
                    <td className="px-4 py-2 font-semibold">{hole.hole}</td>
                    <td className="px-4 py-2">{hole.grossScore ?? "—"}</td>
                    <td className={`px-4 py-2 font-semibold ${classifyTone(hole.sgTotal)}`}>
                      {formatSgValue(hole.sgTotal)}
                    </td>
                    <td className="px-4 py-2 text-xs uppercase tracking-wide text-slate-400">
                      {hole.worstCategory ? CATEGORY_LABELS[hole.worstCategory] : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {derivedHoles.length === 0 && (
            <p className="text-xs text-slate-400">No strokes-gained data recorded for this round.</p>
          )}
        </div>
      )}
    </div>
  );
}

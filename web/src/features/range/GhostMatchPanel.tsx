import React from "react";
import type { TargetBingoConfig, TargetBingoResult } from "./games";
import type { GhostProfile } from "./ghost";

export type GhostMatchPanelProps = {
  cfg: TargetBingoConfig;
  current?: TargetBingoResult | null;
  ghost?: GhostProfile | null;
};

function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return `${Math.round(value)}%`;
}

function formatAverage(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(1)} m`;
}

export function GhostMatchPanel({ cfg, current, ghost }: GhostMatchPanelProps) {
  if (!current || !ghost) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
        Spara en Ghost-session för att jämföra dina Target Bingo-resultat.
      </div>
    );
  }

  const ghostResult = ghost.result;
  const enoughForChallenge = current.totalShots >= cfg.maxShots;
  const currentAvgError = current.avgAbsError_m ?? Infinity;
  const ghostAvgError = ghostResult.avgAbsError_m ?? Infinity;

  const youLeadHitRate = current.hitRate_pct > ghostResult.hitRate_pct;
  const ghostLeadsHitRate = current.hitRate_pct < ghostResult.hitRate_pct;
  const hitRateStatus = youLeadHitRate
    ? "Du leder"
    : ghostLeadsHitRate
      ? "Ghost leder"
      : "Lika";

  const youLeadAccuracy = currentAvgError < ghostAvgError;
  const ghostLeadsAccuracy = currentAvgError > ghostAvgError;
  const accuracyStatus = youLeadAccuracy
    ? "Du leder"
    : ghostLeadsAccuracy
      ? "Ghost leder"
      : "Lika";

  const youWin =
    current.hitRate_pct > ghostResult.hitRate_pct ||
    (current.hitRate_pct === ghostResult.hitRate_pct && currentAvgError < ghostAvgError);

  let challengeText = `Challenge: ${cfg.maxShots} slag.`;
  if (!enoughForChallenge) {
    challengeText += ` Du har slagit ${current.totalShots} av ${cfg.maxShots}.`;
  } else {
    const targetHit = formatPercentage(ghostResult.hitRate_pct);
    const yourHit = formatPercentage(current.hitRate_pct);
    const statusEmoji = youWin ? "✅" : "➡️";
    challengeText += ` Slå Ghostens träff% på ${targetHit} – du är på ${yourHit} ${statusEmoji}`;
  }

  return (
    <div className="rounded-lg border border-emerald-900/40 bg-slate-900/80 p-3 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-100">
          GhostMatch – Target {cfg.target_m} m
        </h2>
        <span className="ml-auto rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
          Aktuell Ghost: {ghost.name}
        </span>
      </div>

      <div className="overflow-hidden rounded border border-slate-800">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-slate-800/60 text-slate-300">
            <tr>
              <th className="px-2 py-1 font-medium">Metric</th>
              <th className="px-2 py-1 font-medium">Du</th>
              <th className="px-2 py-1 font-medium">Ghost</th>
              <th className="px-2 py-1 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-800">
              <td className="px-2 py-1 text-slate-400">Skott</td>
              <td className="px-2 py-1 text-slate-100">{current.totalShots}</td>
              <td className="px-2 py-1 text-slate-100">{ghostResult.totalShots}</td>
              <td className="px-2 py-1 text-slate-500">—</td>
            </tr>
            <tr className="border-t border-slate-800">
              <td className="px-2 py-1 text-slate-400">Träff%</td>
              <td className="px-2 py-1 text-slate-100">{formatPercentage(current.hitRate_pct)}</td>
              <td className="px-2 py-1 text-slate-100">{formatPercentage(ghostResult.hitRate_pct)}</td>
              <td
                className={`px-2 py-1 font-semibold ${
                  youLeadHitRate
                    ? "text-emerald-400"
                    : ghostLeadsHitRate
                      ? "text-orange-400"
                      : "text-slate-300"
                }`}
              >
                {hitRateStatus}
              </td>
            </tr>
            <tr className="border-t border-slate-800">
              <td className="px-2 py-1 text-slate-400">Avg. fel</td>
              <td className="px-2 py-1 text-slate-100">{formatAverage(current.avgAbsError_m)}</td>
              <td className="px-2 py-1 text-slate-100">{formatAverage(ghostResult.avgAbsError_m)}</td>
              <td
                className={`px-2 py-1 font-semibold ${
                  youLeadAccuracy
                    ? "text-emerald-400"
                    : ghostLeadsAccuracy
                      ? "text-orange-400"
                      : "text-slate-300"
                }`}
              >
                {accuracyStatus}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-slate-300">{challengeText}</div>

      <div
        className={`rounded px-2 py-1 text-[11px] font-medium ${
          youWin ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-800 text-slate-200"
        }`}
      >
        {youWin ? "Du leder mot Ghosten – håll i!" : "Ghosten leder – jaga ikapp!"}
      </div>
    </div>
  );
}

export default GhostMatchPanel;

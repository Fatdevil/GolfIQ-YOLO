import { useMemo } from "react";

import type { ParsedRound } from "./utils/parseRound";
import type { Shot } from "./utils/parseShotLog";
import { groupShotsByHole, summarizeShots } from "./utils/sg";

const COLOR_MAP: Record<string, string> = {
  tee: "#34d399",
  approach: "#60a5fa",
  short: "#facc15",
  putt: "#f97316",
};

const LABEL_MAP: Record<string, string> = {
  tee: "Tee",
  approach: "Approach",
  short: "Short",
  putt: "Putt",
};

type SGPanelProps = {
  shots: Shot[];
  round: ParsedRound | null;
};

const formatSg = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const rounded = Number(value.toFixed(2));
  const sign = rounded >= 0 ? "+" : "";
  return `${sign}${rounded.toFixed(2)}`;
};

export function SGPanel({ shots, round }: SGPanelProps) {
  const aggregates = useMemo(() => groupShotsByHole(shots, round), [round, shots]);
  const summary = useMemo(() => summarizeShots(shots), [shots]);

  if (!aggregates.length) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div>
        <h3 className="text-base font-semibold text-slate-100">Strokes gained</h3>
        <p className="text-xs text-slate-400">Per-hole breakdown of tee/approach/short/putt contributions.</p>
      </div>

      <div className="space-y-4">
        {aggregates.map((aggregate) => {
          const segments = [
            { key: "tee", value: aggregate.tee },
            { key: "approach", value: aggregate.approach },
            { key: "short", value: aggregate.short },
            { key: "putt", value: aggregate.putt },
          ];
          const totalMagnitude = segments.reduce((acc, segment) => acc + Math.abs(segment.value), 0) || 1;
          return (
            <div key={aggregate.id} className="space-y-1">
              <div className="flex items-center justify-between text-sm text-slate-200">
                <span>
                  {aggregate.label}
                  {aggregate.par !== null ? ` · Par ${aggregate.par}` : ""}
                  {aggregate.shots.length ? ` · ${aggregate.shots.length} shots` : ""}
                </span>
                <span className="font-semibold text-slate-100">{formatSg(aggregate.total)}</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded bg-slate-800">
                {segments.map((segment) => {
                  const width = Math.max(2, (Math.abs(segment.value) / totalMagnitude) * 100);
                  const color = COLOR_MAP[segment.key];
                  const positive = segment.value >= 0;
                  return (
                    <div
                      key={segment.key}
                      style={{
                        width: `${width}%`,
                        backgroundColor: color,
                        opacity: positive ? 0.85 : 0.45,
                      }}
                      title={`${LABEL_MAP[segment.key]} ${formatSg(segment.value)}`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                {segments.map((segment) => (
                  <span key={`${aggregate.id}-${segment.key}`}>
                    {LABEL_MAP[segment.key]} {formatSg(segment.value)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-800 pt-3 text-xs text-slate-300">
        <div>Total SG: {formatSg(summary.total)}</div>
        <div>
          Tee {formatSg(summary.tee)} · Approach {formatSg(summary.approach)} · Short {formatSg(summary.short)} ·
          Putt {formatSg(summary.putt)}
        </div>
        <div>
          Shots with plan: {summary.adopted.count}{" "}
          {summary.adopted.average !== null ? `(${formatSg(summary.adopted.average)})` : ""}; without plan:{" "}
          {summary.notAdopted.count}
          {summary.notAdopted.average !== null ? ` (${formatSg(summary.notAdopted.average)})` : ""}
        </div>
        {summary.lift !== null ? (
          <div>Adoption lift: {formatSg(summary.lift)}</div>
        ) : null}
      </div>
    </section>
  );
}

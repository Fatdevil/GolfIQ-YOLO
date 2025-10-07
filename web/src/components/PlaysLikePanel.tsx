import { useMemo } from "react";
import { compute, type PlaysLikeOptions } from "@shared/playslike/PlaysLikeService";

interface PlaysLikePanelProps {
  enabled: boolean;
  distanceMeters?: number | null;
  deltaHMeters?: number | null;
  windParallel?: number | null;
  options?: PlaysLikeOptions;
}

const formatDelta = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)} m`;

const qualityStyles: Record<string, string> = {
  good: "bg-emerald-500/90 text-emerald-950",
  warn: "bg-amber-400/90 text-amber-950",
  low: "bg-rose-500/90 text-rose-50",
};

export default function PlaysLikePanel({
  enabled,
  distanceMeters,
  deltaHMeters,
  windParallel,
  options,
}: PlaysLikePanelProps) {
  const result = useMemo(() => {
    if (!enabled) return null;
    if (
      distanceMeters === undefined ||
      distanceMeters === null ||
      !Number.isFinite(distanceMeters) ||
      distanceMeters <= 0
    ) {
      return null;
    }
    const delta = Number.isFinite(deltaHMeters ?? NaN) ? (deltaHMeters as number) : 0;
    const wind = Number.isFinite(windParallel ?? NaN) ? (windParallel as number) : 0;
    return compute(distanceMeters, delta, wind, options);
  }, [enabled, distanceMeters, deltaHMeters, windParallel, options]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-800/80 bg-slate-900/80 p-4 shadow-inner">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">Plays-like distance</p>
          {result ? (
            <p className="text-xs text-slate-400">
              Plays-like {result.distanceEff.toFixed(1)} m (Δ {formatDelta(
                result.components.slopeM + result.components.windM
              )})
            </p>
          ) : (
            <p className="text-xs text-slate-500">Not enough data to compute adjustments.</p>
          )}
        </div>
        {result ? (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              qualityStyles[result.quality] ?? "bg-slate-600 text-slate-100"
            }`}
          >
            {result.quality}
          </span>
        ) : null}
      </div>
      {result ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-200">
          <span className="rounded-full bg-slate-700/70 px-3 py-1">
            slope {formatDelta(result.components.slopeM)}
          </span>
          <span className="rounded-full bg-slate-700/70 px-3 py-1">
            wind {formatDelta(result.components.windM)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

import React from "react";
import { useUnits } from "@/preferences/UnitsContext";
import { formatDistance } from "@/utils/distance";
import { RangeShotMetrics } from "./types";

type Props = {
  metrics: RangeShotMetrics | null;
};

export function RangeImpactCard({ metrics }: Props) {
  const { unit } = useUnits();

  if (!metrics) {
    return (
      <div className="border border-slate-800 rounded-lg bg-slate-900/50 p-4 text-sm text-slate-400">
        Hit a shot to see your impact metrics.
      </div>
    );
  }

  const { ballSpeedMph, carryM, launchDeg, sideAngleDeg, quality } = metrics;

  const qualityLabel =
    quality === "good" ? "Solid" : quality === "medium" ? "OK" : "Needs work";

  return (
    <div className="border border-slate-800 rounded-lg bg-slate-900/70 p-4 flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase text-slate-400">Ball speed</div>
          <div className="text-2xl font-semibold text-emerald-300">
            {ballSpeedMph != null ? `${ballSpeedMph.toFixed(1)} mph` : "—"}
          </div>
        </div>
        <div className="text-xs px-2 py-1 rounded-full bg-slate-800 text-slate-200">
          {qualityLabel}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-slate-300">
        <div>
          <div className="text-slate-500">Carry</div>
          <div className="font-medium text-slate-100">
            {formatDistance(carryM, unit, { withUnit: true })}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Launch</div>
          <div className="font-medium text-slate-100">
            {launchDeg != null ? `${launchDeg.toFixed(1)}°` : "—"}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Side angle</div>
          <div className="font-medium text-slate-100">
            {sideAngleDeg != null ? `${sideAngleDeg.toFixed(1)}°` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

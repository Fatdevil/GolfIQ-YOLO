import { useMemo } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DispersionStats, Shot } from "../utils/parseShotLog";

export type DispersionSeries = {
  id: string;
  label: string;
  color: string;
  shots: Shot[];
  stats: DispersionStats;
};

interface DispersionPlotProps {
  series: DispersionSeries[];
}

type ScatterPoint = {
  x: number;
  y: number;
  shotId: string;
  club: string | null;
  carry: number | null;
  run: string;
};

function roundDomain(value: number): number {
  if (!Number.isFinite(value) || value <= 2) {
    return 5;
  }
  const padded = value + 1;
  const step = 5;
  return Math.ceil(padded / step) * step;
}

function formatNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "n/a";
  }
  return Number.isFinite(value) ? value.toFixed(1) : String(value);
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "n/a";
  }
  return `${value.toFixed(1)}%`;
}

export function DispersionPlot({ series }: DispersionPlotProps) {
  const points = useMemo(() => {
    return series.map((entry) => ({
      entry,
      data: entry.shots
        .filter((shot) => shot.relative !== null)
        .map((shot) => ({
          x: (shot.relative?.x ?? 0) as number,
          y: (shot.relative?.y ?? 0) as number,
          shotId: shot.shotId,
          club: shot.club,
          carry: shot.carry_m,
          run: entry.label,
        })),
    }));
  }, [series]);

  const allPoints = useMemo(() => points.flatMap((item) => item.data), [points]);

  const maxAbsX = useMemo(() => {
    const values = allPoints.map((point) => Math.abs(point.x));
    if (!values.length) {
      return 5;
    }
    return roundDomain(Math.max(...values));
  }, [allPoints]);

  const maxAbsY = useMemo(() => {
    const values = allPoints.map((point) => Math.abs(point.y));
    if (!values.length) {
      return 5;
    }
    return roundDomain(Math.max(...values));
  }, [allPoints]);

  return (
    <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Dispersion</h3>
          <p className="text-xs text-slate-400">Relative to pin (0, 0). +Y = long, +X = right.</p>
        </div>
      </div>
      <div className="h-72 w-full">
        {allPoints.length ? (
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 16, right: 20, bottom: 16, left: 0 }}>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                name="Left / Right"
                unit="m"
                domain={[-maxAbsX, maxAbsX]}
                tickFormatter={(value) => value.toFixed(0)}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Short / Long"
                unit="m"
                domain={[-maxAbsY, maxAbsY]}
                tickFormatter={(value) => value.toFixed(0)}
              />
              <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="4 4" />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
              <Tooltip content={<DispersionTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "#cbd5f5" }} />
              {points.map(({ entry, data }) => (
                <Scatter
                  key={entry.id}
                  name={entry.label}
                  data={data}
                  fill={entry.color}
                  shape="circle"
                  legendType="circle"
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No shots logged yet.
          </div>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {series.map((entry) => (
          <div key={entry.id} className="flex items-start gap-3 rounded bg-slate-900/60 p-3">
            <span
              className="mt-1 inline-block h-3 w-3 flex-shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <div className="text-sm text-slate-300">
              <p className="font-semibold text-slate-100">{entry.label}</p>
              <p className="text-xs text-slate-400">
                μₓ {formatNumber(entry.stats.meanX)} m · μᵧ {formatNumber(entry.stats.meanY)} m · σₓ {formatNumber(entry.stats.stdX)} m · σᵧ{' '}
                {formatNumber(entry.stats.stdY)} m · left {formatPercent(entry.stats.pctLeft)} · right {formatPercent(entry.stats.pctRight)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type TooltipPayload = {
  payload?: ScatterPoint;
};

type TooltipProps = {
  active?: boolean;
  payload?: TooltipPayload[];
};

function DispersionTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }
  const point = payload[0]?.payload as ScatterPoint | undefined;
  if (!point) {
    return null;
  }
  return (
    <div className="rounded border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 shadow-lg">
      <p className="font-semibold">{point.run}</p>
      <p>Shot: {point.shotId}</p>
      <p>Offset: {point.x.toFixed(1)} m (LR), {point.y.toFixed(1)} m (long)</p>
      <p>Club: {point.club ?? 'n/a'}</p>
      <p>Carry: {point.carry !== null ? `${point.carry.toFixed(1)} m` : 'n/a'}</p>
    </div>
  );
}

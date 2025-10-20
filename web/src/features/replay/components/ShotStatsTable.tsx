import type { DispersionSeries } from "./DispersionPlot";

interface ShotStatsTableProps {
  series: DispersionSeries[];
}

function formatNumber(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) {
    return "n/a";
  }
  return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "n/a";
  }
  return `${value.toFixed(1)}%`;
}

const ROWS: Array<{
  key: keyof DispersionSeries["stats"] | "count";
  label: string;
  render: (stats: DispersionSeries["stats"]) => string;
}> = [
  { key: "count", label: "Shots logged", render: (stats) => stats.count.toString() },
  { key: "avgCarry", label: "Avg carry (m)", render: (stats) => formatNumber(stats.avgCarry, 1) },
  { key: "stdCarry", label: "Carry σ (m)", render: (stats) => formatNumber(stats.stdCarry, 1) },
  { key: "meanY", label: "Mean long (m)", render: (stats) => formatNumber(stats.meanY, 1) },
  { key: "meanX", label: "Mean left/right (m)", render: (stats) => formatNumber(stats.meanX, 1) },
  { key: "pctShort", label: "% short", render: (stats) => formatPercent(stats.pctShort) },
  { key: "pctLong", label: "% long", render: (stats) => formatPercent(stats.pctLong) },
  { key: "pctLeft", label: "% left", render: (stats) => formatPercent(stats.pctLeft) },
  { key: "pctRight", label: "% right", render: (stats) => formatPercent(stats.pctRight) },
];

export function ShotStatsTable({ series }: ShotStatsTableProps) {
  if (!series.length) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60">
      <div className="border-b border-slate-800 px-4 py-3">
        <h3 className="text-lg font-semibold text-slate-100">Shot stats</h3>
        <p className="text-xs text-slate-400">Summary of carry and dispersion outcomes.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-sm text-slate-200">
          <thead className="bg-slate-900/80">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Metric</th>
              {series.map((entry) => (
                <th key={entry.id} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    {entry.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className="odd:bg-slate-900/40">
                <td className="px-4 py-2 text-slate-300">{row.label}</td>
                {series.map((entry) => (
                  <td key={entry.id} className="px-4 py-2 font-mono text-slate-100">
                    {row.render(entry.stats)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

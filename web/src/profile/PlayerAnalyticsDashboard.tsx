import { Link } from "react-router-dom";

import type { CategoryStatus, PlayerAnalytics } from "@/api/analytics";

const CATEGORY_LABELS: Record<CategoryStatus["category"], string> = {
  tee: "Tee",
  approach: "Approach",
  short: "Short game",
  putt: "Putting",
  sequence: "Sequence",
};

const SEVERITY_COLORS: Record<CategoryStatus["lastSeverity"], string> = {
  ok: "text-emerald-300",
  focus: "text-amber-300",
  critical: "text-rose-300",
};

const TREND_LABELS: Record<CategoryStatus["recentTrend"], string> = {
  improving: "Improving",
  stable: "Stable",
  worsening: "Worsening",
};

export function PlayerAnalyticsDashboard({ analytics }: { analytics: PlayerAnalytics }) {
  const bestRun = analytics.bestRoundId;
  const worstRun = analytics.worstRoundId;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {analytics.categoryStatus.map((status) => (
          <div
            key={status.category}
            className="rounded-md border border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-slate-100">{CATEGORY_LABELS[status.category]}</p>
              <p className="text-[11px] text-slate-400">{TREND_LABELS[status.recentTrend]}</p>
            </div>
            <span className={`text-xs font-semibold uppercase ${SEVERITY_COLORS[status.lastSeverity]}`}>
              {status.lastSeverity}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-100">Recent SG trend</p>
          <span className="text-[11px] text-slate-500">Latest {analytics.sgTrend.length} rounds</span>
        </div>
        {analytics.sgTrend.length === 0 ? (
          <p className="text-xs text-slate-400">No strokes gained data yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800 text-sm">
            {analytics.sgTrend.map((point) => {
              const badges: string[] = [];
              if (point.runId === bestRun) badges.push("Best");
              if (point.runId === worstRun) badges.push("Toughest");
              return (
                <li key={point.runId} className="flex items-center justify-between py-2">
                  <div className="space-y-[2px]">
                    <p className="text-slate-100">{formatDate(point.date)}</p>
                    <p className="text-[11px] text-slate-500">Run {point.runId}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-100">{point.sgTotal.toFixed(2)} sg</p>
                    <p className="text-[11px] text-slate-400">
                      T:{point.sgTee.toFixed(1)} | A:{point.sgApproach.toFixed(1)} | S:{point.sgShort.toFixed(1)} | P:
                      {point.sgPutt.toFixed(1)}
                    </p>
                    {badges.length > 0 && (
                      <div className="text-[10px] text-emerald-300 font-semibold uppercase">{badges.join(" · ")}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-100">Mission progress</p>
          <span className="text-[11px] text-slate-500">Practice</span>
        </div>
        <div className="text-sm text-slate-200">
          <p className="font-semibold">{analytics.missionStats.completed} completed missions</p>
          <p className="text-xs text-slate-400">
            {analytics.missionStats.totalMissions} attempted • {formatPercent(analytics.missionStats.completionRate)} completion
            rate
          </p>
        </div>
        <div>
          <Link
            to="/range/practice"
            className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
          >
            Start a mission
          </Link>
        </div>
      </div>
    </div>
  );
}

function formatDate(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatPercent(value: number): string {
  const pct = Math.round((value || 0) * 1000) / 10;
  return `${pct.toFixed(1)}%`;
}

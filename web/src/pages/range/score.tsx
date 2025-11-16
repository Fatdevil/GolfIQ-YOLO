import { useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useUnits } from "@/preferences/UnitsContext";
import type { DistanceUnit } from "@/preferences/units";
import { formatDistance } from "@/utils/distance";

type RangeSummary = {
  mode?: string;
  score?: number;
  startedAt?: number | null;
  endedAt?: number | null;
  hits?: number;
  bestClub?: string | null;
  targets?: { label?: string; carry_m?: number | null }[];
  perClub?: Record<string, { shots?: number | null; hits?: number | null; score?: number | null }>;
};

type ClubSummary = {
  club: string;
  shots: number;
  hits: number;
  score: number;
};

function decodeSummaryToken(token: string | null): RangeSummary | null {
  if (!token) {
    return null;
  }
  try {
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
    const base = normalized + "=".repeat(pad);
    const globalBuffer = (globalThis as {
      Buffer?: { from(input: string, encoding: string): { toString(encoding: string): string } };
    }).Buffer;
    let json: string | null = null;
    if (typeof window !== "undefined" && typeof window.atob === "function") {
      json = window.atob(base);
    } else if (globalBuffer) {
      json = globalBuffer.from(base, "base64").toString("utf8");
    }
    if (!json) {
      return null;
    }
    return JSON.parse(json) as RangeSummary;
  } catch (error) {
    console.warn("Failed to decode range summary", error);
    return null;
  }
}

function formatDuration(startedAt?: number | null, endedAt?: number | null): string | null {
  if (!startedAt || !Number.isFinite(startedAt)) {
    return null;
  }
  const end = endedAt && Number.isFinite(endedAt) ? endedAt : Date.now();
  const ms = Math.max(0, end - startedAt);
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function summarizeClubs(perClub: RangeSummary["perClub"]): ClubSummary[] {
  if (!perClub) {
    return [];
  }
  const entries: ClubSummary[] = Object.entries(perClub).map(([club, stats]) => ({
    club,
    shots: Number(stats.shots ?? 0),
    hits: Number(stats.hits ?? 0),
    score: Number(stats.score ?? 0),
  }));
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.hits !== a.hits) return b.hits - a.hits;
    if (b.shots !== a.shots) return b.shots - a.shots;
    return a.club.localeCompare(b.club);
  });
  return entries;
}

function formatCarryList(targets: RangeSummary["targets"], unit: DistanceUnit): string {
  if (!targets || !targets.length) {
    return "—";
  }
  return targets
    .map((target) => {
      if (target?.label) {
        return target.label;
      }
      if (typeof target?.carry_m === "number") {
        return formatDistance(target.carry_m, unit, { withUnit: true });
      }
      return null;
    })
    .filter((value): value is string => Boolean(value))
    .join(" • ");
}

function formatDate(timestamp?: number | null): string | null {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return null;
  }
  try {
    return new Date(timestamp).toLocaleString();
  } catch (error) {
    console.warn("Failed to format timestamp", error);
    return null;
  }
}

function drawScoreCard(canvas: HTMLCanvasElement, summary: RangeSummary, clubs: ClubSummary[], carries: string, duration: string | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const width = canvas.width;
  const height = canvas.height;
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(40, 40, width - 80, height - 80);

  ctx.fillStyle = "#38bdf8";
  ctx.font = "600 54px 'Inter', 'Helvetica Neue', sans-serif";
  ctx.fillText("Range Games", 80, 130);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 96px 'Inter', 'Helvetica Neue', sans-serif";
  ctx.fillText(`${summary.score ?? 0}`, 80, 240);
  ctx.font = "600 32px 'Inter', 'Helvetica Neue', sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Score", 80, 190);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 48px 'Inter', 'Helvetica Neue', sans-serif";
  ctx.fillText(`${summary.hits ?? 0} hits`, 80, 320);
  ctx.font = "400 26px 'Inter', 'Helvetica Neue', sans-serif";
  ctx.fillStyle = "#94a3b8";
  const clubLabel = summary.bestClub ? `Best club: ${summary.bestClub}` : "Best club: —";
  ctx.fillText(clubLabel, 80, 368);
  if (duration) {
    ctx.fillText(`Duration: ${duration}`, 80, 408);
  }

  ctx.font = "600 26px 'Inter', 'Helvetica Neue', sans-serif";
  ctx.fillStyle = "#e2e8f0";
  ctx.fillText("Targets", 80, 460);
  ctx.font = "400 24px 'Inter', 'Helvetica Neue', sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(carries || "—", 80, 500, width - 160);

  ctx.fillStyle = "#1e293b";
  ctx.fillRect(width / 2, 140, 4, height - 220);

  ctx.font = "600 32px 'Inter', 'Helvetica Neue', sans-serif";
  ctx.fillStyle = "#f8fafc";
  ctx.fillText("Per-club ladder", width / 2 + 80, 200);

  ctx.font = "600 24px 'Inter', 'Helvetica Neue', sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Club", width / 2 + 80, 250);
  ctx.fillText("Shots", width / 2 + 220, 250);
  ctx.fillText("Hits", width / 2 + 340, 250);
  ctx.fillText("Score", width / 2 + 440, 250);

  ctx.font = "400 24px 'Inter', 'Helvetica Neue', sans-serif";
  ctx.fillStyle = "#f8fafc";
  const rowHeight = 36;
  clubs.slice(0, 6).forEach((entry, index) => {
    const y = 290 + rowHeight * index;
    ctx.fillText(entry.club, width / 2 + 80, y);
    ctx.fillText(entry.shots.toString(), width / 2 + 220, y);
    ctx.fillText(entry.hits.toString(), width / 2 + 340, y);
    ctx.fillText(entry.score.toString(), width / 2 + 440, y);
  });

  ctx.font = "600 20px 'Inter', 'Helvetica Neue', sans-serif";
  ctx.fillStyle = "#38bdf8";
  ctx.fillText("golfiq.app", width - 240, height - 80);
}

export default function RangeScorePage(): JSX.Element {
  const location = useLocation();
  const { unit } = useUnits();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const summary = useMemo(() => decodeSummaryToken(params.get("s")), [params]);

  const clubs = useMemo(() => summarizeClubs(summary?.perClub), [summary]);
  const carries = useMemo(() => formatCarryList(summary?.targets, unit), [summary, unit]);
  const duration = useMemo(
    () => formatDuration(summary?.startedAt ?? null, summary?.endedAt ?? null),
    [summary],
  );
  const startedAtLabel = useMemo(() => formatDate(summary?.startedAt ?? null), [summary]);

  const handleDownload = useCallback(() => {
    if (!summary) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 628;
    drawScoreCard(canvas, summary, clubs, carries, duration);
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `range-score-${summary.score ?? 0}.png`;
    link.click();
  }, [summary, clubs, carries, duration]);

  if (!summary) {
    return (
      <section className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-slate-100">Range scoreboard</h1>
          <p className="text-sm text-slate-400">No summary payload detected.</p>
        </header>
        <p className="rounded border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
          Provide a base64 payload via <code className="font-mono">?s=</code> to render a shared Range Games card.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Range scoreboard</h1>
          <p className="text-sm text-slate-400">
            Target Bingo summary with per-club ladder and quick export for social sharing.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm hover:bg-emerald-400"
        >
          Download PNG
        </button>
      </header>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-lg shadow-black/30">
        <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-500">Score</p>
              <p className="text-6xl font-semibold text-slate-50">{summary.score ?? 0}</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Hits</p>
                <p className="text-2xl font-semibold text-slate-100">{summary.hits ?? 0}</p>
              </div>
              <div className="rounded-lg bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Best club</p>
                <p className="text-2xl font-semibold text-slate-100">{summary.bestClub ?? "—"}</p>
              </div>
              <div className="rounded-lg bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Duration</p>
                <p className="text-2xl font-semibold text-slate-100">{duration ?? "—"}</p>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Targets</p>
              <p className="font-mono text-sm text-slate-300">{carries || "—"}</p>
            </div>
            {startedAtLabel && (
              <p className="text-xs text-slate-500">Started {startedAtLabel}</p>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Per-club ladder</h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead className="bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Club</th>
                    <th className="px-4 py-2 text-right font-semibold">Shots</th>
                    <th className="px-4 py-2 text-right font-semibold">Hits</th>
                    <th className="px-4 py-2 text-right font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {clubs.length === 0 ? (
                    <tr>
                      <td className="px-4 py-3 text-center text-slate-500" colSpan={4}>
                        No club stats captured yet.
                      </td>
                    </tr>
                  ) : (
                    clubs.map((entry) => (
                      <tr key={entry.club} className="odd:bg-slate-900/60">
                        <td className="px-4 py-2 font-medium text-slate-100">{entry.club}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-200">{entry.shots}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-200">{entry.hits}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-100">{entry.score}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

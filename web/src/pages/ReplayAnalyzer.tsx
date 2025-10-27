import { useCallback, useEffect, useMemo, useState } from "react";

import { BenchCompare } from "../features/replay/components/BenchCompare";
import { DispersionPlot, type DispersionSeries } from "../features/replay/components/DispersionPlot";
import { MetricChart } from "../features/replay/components/MetricChart";
import { SGPanel } from "../features/replay/SGPanel";
import { RunTimeline } from "../features/replay/components/RunTimeline";
import { RunUpload, type LoadedRunPatch, type RunSlot } from "../features/replay/components/RunUpload";
import { ShotStatsTable } from "../features/replay/components/ShotStatsTable";
import type { BenchSummary } from "../features/replay/utils/parseBenchSummary";
import { parseHudRun, type ParsedHudRun } from "../features/replay/utils/parseHudRun";
import { parseRound, type ParsedRound } from "../features/replay/utils/parseRound";
import { computeDispersion, parseShotLog, type DispersionStats, type Shot } from "../features/replay/utils/parseShotLog";
import { fetchRun } from "../lib/fetchRun";
import { mkReportMd } from "../features/replay/utils/mkReportMd";
import { summarizeShots } from "../features/replay/utils/sg";

type RunState = {
  run: ParsedHudRun | null;
  shots: Shot[];
  round: ParsedRound | null;
};

export default function ReplayAnalyzerPage() {
  const [primary, setPrimary] = useState<RunState | null>(null);
  const [comparison, setComparison] = useState<RunState | null>(null);
  const [activeSlot, setActiveSlot] = useState<RunSlot>("primary");
  const [benchSummary, setBenchSummary] = useState<BenchSummary>({});
  const [exportError, setExportError] = useState<string | null>(null);
  const [shareParam] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const value = params.get("share");
    return value && value.trim() ? value.trim() : null;
  });

  const applyRunPatch = useCallback(
    (payload: LoadedRunPatch, slot: RunSlot) => {
      const updater = (prev: RunState | null): RunState => {
        const base: RunState = prev ?? { run: null, shots: [], round: null };
        const next: RunState = {
          run: payload.run ?? base.run,
          shots: payload.shots ?? base.shots,
          round: 'round' in payload ? payload.round ?? null : base.round,
        };
        return next;
      };
      if (slot === 'primary') {
        setPrimary((prev) => updater(prev));
        if (payload.run) {
          setActiveSlot('primary');
          setExportError(null);
        }
      } else {
        setComparison((prev) => updater(prev));
        if (payload.run) {
          setActiveSlot('comparison');
        }
      }
    },
    [setActiveSlot, setExportError],
  );

  const handleExport = useCallback(() => {
    if (!primary || !primary.run) {
      setExportError("Load a primary hud_run.json first");
      return;
    }
    try {
      const dispersion = computeDispersion(primary.shots);
      const sgSummary = summarizeShots(primary.shots);
      const markdown = mkReportMd(primary.run, benchSummary, dispersion, sgSummary);
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const fileName = `${primary.run.summary.sessionId ?? "hud-run"}.md`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setExportError(null);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    }
  }, [benchSummary, primary]);

  useEffect(() => {
    if (!shareParam) {
      return;
    }
    let active = true;
    fetchRun(shareParam)
      .then((payload) => {
        if (!active) return;
        if (!payload) {
          setExportError("Shared run not found or has expired");
          return;
        }
        try {
          if (payload.kind === "hud") {
            const parsed = parseHudRun(payload.events);
            const shots = parseShotLog(payload.events);
            applyRunPatch({ run: parsed, shots }, "primary");
          } else {
            const round = parseRound(payload.record);
            applyRunPatch({ round }, "primary");
          }
          setExportError(null);
        } catch (error) {
          setExportError(error instanceof Error ? error.message : String(error));
        }
      })
      .catch((error) => {
        if (!active) return;
        setExportError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, [applyRunPatch, shareParam]);

  const activeRun = useMemo(() => {
    if (activeSlot === "comparison") {
      return comparison ?? primary;
    }
    return primary ?? comparison;
  }, [activeSlot, comparison, primary]);

  const activeHud = activeRun?.run ?? null;
  const activeShots = activeRun?.shots ?? [];
  const hasSgData = useMemo(
    () => activeShots.some((shot) => shot.sg && Number.isFinite(shot.sg.total ?? Number.NaN)),
    [activeShots],
  );

  const fpsSeries = useMemo(() => {
    if (!activeHud) return [];
    return activeHud.frames.map((frame) => ({
      timeSec: frame.timeSec,
      value: frame.fps ?? null,
    }));
  }, [activeHud]);

  const latencySeries = useMemo(() => {
    if (!activeHud) return [];
    return activeHud.frames.map((frame) => ({
      timeSec: frame.timeSec,
      value: frame.latencyMs ?? null,
    }));
  }, [activeHud]);

  const rmsSeries = useMemo(() => {
    if (!activeHud) return [];
    return activeHud.frames.map((frame) => ({
      timeSec: frame.timeSec,
      value: frame.rms ?? null,
    }));
  }, [activeHud]);

  const headingSeries = useMemo(() => {
    if (!activeHud) return [] as Array<{ timeSec: number; heading?: number | null }>;
    return activeHud.frames.map((frame) => ({
      timeSec: frame.timeSec,
      heading: frame.headingSmoothed ?? frame.headingRaw ?? null,
    }));
  }, [activeHud]);

  const primaryStats = useMemo(() => (primary ? computeDispersion(primary.shots) : null), [primary]);
  const comparisonStats = useMemo(
    () => (comparison ? computeDispersion(comparison.shots) : null),
    [comparison],
  );

  const dispersionSeries = useMemo<DispersionSeries[]>(() => {
    const entries: DispersionSeries[] = [];
    if (primary?.run && primaryStats) {
      const sessionId = primary.run.summary.sessionId ?? "primary";
      entries.push({
        id: `primary-${sessionId}`,
        label: `Primary · ${sessionId}`,
        color: "#34d399",
        shots: primary.shots,
        stats: primaryStats,
      });
    }
    if (comparison?.run && comparisonStats) {
      const sessionId = comparison.run.summary.sessionId ?? "comparison";
      entries.push({
        id: `comparison-${sessionId}`,
        label: `Comparison · ${sessionId}`,
        color: "#60a5fa",
        shots: comparison.shots,
        stats: comparisonStats,
      });
    }
    return entries;
  }, [comparison, comparisonStats, primary, primaryStats]);

  const isPrimaryActive = Boolean(primary && activeRun === primary);
  const isComparisonActive = Boolean(comparison && activeRun === comparison);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-100">Replay analyzer</h1>
        <p className="text-sm text-slate-400">
          Inspect exported hud_run.json captures, visualise frame metrics, and compare against bench defaults.
        </p>
      </header>

      <RunUpload onRunLoaded={applyRunPatch} />

      {primary || comparison ? (
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {primary && (
              <RunSummaryCard
                label="Primary"
                run={primary}
                stats={primaryStats}
                active={isPrimaryActive}
                onSelect={() => setActiveSlot("primary")}
              />
            )}
            {comparison && (
              <RunSummaryCard
                label="Comparison"
                run={comparison}
                stats={comparisonStats}
                active={isComparisonActive}
                onSelect={() => setActiveSlot("comparison")}
              />
            )}
          </div>

          {activeHud ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-100">
                  Active run: {activeRun?.run?.summary.sessionId ?? "n/a"}
                </h2>
                {primary && comparison ? (
                  <div className="inline-flex overflow-hidden rounded border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setActiveSlot("primary")}
                      className={`px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                        activeSlot === "primary"
                          ? "bg-emerald-500 text-emerald-950"
                          : "bg-slate-900/70 text-slate-300 hover:bg-slate-800/70"
                      }`}
                    >
                      Primary
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSlot("comparison")}
                      className={`px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                        activeSlot === "comparison"
                          ? "bg-emerald-500 text-emerald-950"
                          : "bg-slate-900/70 text-slate-300 hover:bg-slate-800/70"
                      }`}
                    >
                      Comparison
                    </button>
                  </div>
                ) : null}
              </div>

              <RunTimeline
                segments={activeHud.timeline}
                totalDurationMs={activeHud.summary.durationMs ?? 0}
                recenterIntervals={activeHud.recenterIntervals}
              />

              <div className="grid gap-6 lg:grid-cols-2">
                <MetricChart
                  title="Frame rate"
                  color="#34d399"
                  data={fpsSeries}
                  unit="fps"
                  recenterIntervals={activeHud.recenterIntervals.map((interval) => ({
                    startSec: interval.startSec,
                    endSec: interval.endSec,
                  }))}
                />
                <MetricChart
                  title="Latency"
                  color="#f97316"
                  data={latencySeries}
                  unit="ms"
                  recenterIntervals={activeHud.recenterIntervals.map((interval) => ({
                    startSec: interval.startSec,
                    endSec: interval.endSec,
                  }))}
                />
                <MetricChart
                  title="Heading RMS"
                  color="#60a5fa"
                  data={rmsSeries}
                  unit="deg"
                  recenterIntervals={activeHud.recenterIntervals.map((interval) => ({
                    startSec: interval.startSec,
                    endSec: interval.endSec,
                  }))}
                />
                <MetricChart
                  title="Heading"
                  color="#c084fc"
                  data={headingSeries.map((sample) => ({ timeSec: sample.timeSec, value: sample.heading ?? null }))}
                  unit="deg"
                  recenterIntervals={activeHud.recenterIntervals.map((interval) => ({
                    startSec: interval.startSec,
                    endSec: interval.endSec,
                  }))}
                />
              </div>
            </>
          ) : (
            <div className="rounded border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-400">
              Load a run to view timeline and frame metrics.
            </div>
          )}

          {activeRun?.round ? <RoundSummaryPanel round={activeRun.round} /> : null}

          {hasSgData ? <SGPanel shots={activeShots} round={activeRun?.round ?? null} /> : null}

          {dispersionSeries.length ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <DispersionPlot series={dispersionSeries} />
              <ShotStatsTable series={dispersionSeries} />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExport}
              className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow hover:bg-emerald-400"
            >
              Export report
            </button>
            {exportError && <span className="text-sm text-rose-400">{exportError}</span>}
          </div>
        </section>
      ) : (
        <div className="rounded border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-400">
          Load a hud_run.json file to see charts and metrics. Round summaries will appear when a round_run.json is provided.
        </div>
      )}

      <BenchCompare
        onSummaryLoaded={(summary) => {
          setBenchSummary(summary);
        }}
      />
    </div>
  );
}

type RunSummaryCardProps = {
  label: string;
  run: RunState;
  stats: DispersionStats | null;
  active: boolean;
  onSelect: () => void;
};

type RoundSummaryPanelProps = {
  round: ParsedRound;
};

function RoundSummaryPanel({ round }: RoundSummaryPanelProps) {
  const firPercent = round.firEligible ? Math.round((round.firHit / round.firEligible) * 100) : null;
  const girPercent = round.girEligible ? Math.round((round.girHit / round.girEligible) * 100) : null;
  const relativeText = round.relative === 0 ? 'E' : round.relative > 0 ? `+${round.relative}` : `${round.relative}`;
  const started = new Date(round.startedAt).toLocaleString();
  return (
    <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-col gap-2 text-sm text-slate-300 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-base font-semibold text-slate-100">Round summary</div>
          <div>Course: {round.courseId}{round.tee ? ` · ${round.tee}` : ''}</div>
          <div>Started: {started}</div>
        </div>
        <div className="text-sm text-slate-200">
          <div>Total: {round.totalScore} (par {round.totalPar}) · {relativeText}</div>
          <div>FIR: {round.firHit}/{round.firEligible}{firPercent !== null ? ` (${firPercent}%)` : ''}</div>
          <div>GIR: {round.girHit}/{round.girEligible}{girPercent !== null ? ` (${girPercent}%)` : ''}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-left text-xs text-slate-300">
          <thead className="bg-slate-900/70 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-semibold">Hole</th>
              <th className="px-3 py-2 font-semibold">Par</th>
              <th className="px-3 py-2 font-semibold">Score</th>
              <th className="px-3 py-2 font-semibold">FIR</th>
              <th className="px-3 py-2 font-semibold">GIR</th>
            </tr>
          </thead>
          <tbody>
            {round.holes.map((hole) => (
              <tr key={hole.holeNo} className="odd:bg-slate-900/40">
                <td className="px-3 py-2">{hole.holeNo}</td>
                <td className="px-3 py-2">{hole.par}</td>
                <td className="px-3 py-2">{hole.score}</td>
                <td className="px-3 py-2">{hole.fir === null ? '—' : hole.fir ? '✔︎' : '×'}</td>
                <td className="px-3 py-2">{hole.gir === null ? '—' : hole.gir ? '✔︎' : '×'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RunSummaryCard({ label, run, stats, active, onSelect }: RunSummaryCardProps) {
  const sessionId = run.run?.summary.sessionId ?? run.round?.id ?? 'n/a';
  const deviceText = run.run?.summary.device ?? 'device unknown';
  const osText = run.run?.summary.os ?? 'os unknown';
  const shotsCount = stats ? stats.count : run.round ? run.round.holes.reduce((acc, hole) => acc + hole.strokes, 0) : 0;
  const relativeText = run.round ? (run.round.relative === 0 ? 'E' : run.round.relative > 0 ? `+${run.round.relative}` : `${run.round.relative}`) : null;
  const baseClasses =
    "w-full rounded-lg border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-400";
  const classes = active
    ? `${baseClasses} border-emerald-400 bg-slate-900/60 shadow-lg`
    : `${baseClasses} border-slate-800 bg-slate-900/40 hover:border-emerald-400`;
  return (
    <button type="button" onClick={onSelect} className={classes}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="text-lg font-semibold text-slate-100">{sessionId}</p>
          <p className="text-xs text-slate-400">{deviceText} · {osText}</p>
        </div>
        <div className="text-right text-xs text-slate-300">
          <div>Shots: {shotsCount}</div>
          <div>Avg carry: {stats ? formatNumber(stats.avgCarry) : "n/a"} m</div>
        </div>
      </div>
      <div className="mt-3 grid gap-1 text-xs text-slate-300">
        {run.run ? (
          <>
            <div>Avg FPS: {formatNumber(run.run.summary.avgFps)}</div>
            <div>Latency p95: {formatNumber(run.run.summary.p95Latency)} ms</div>
            <div>RMS mean: {formatNumber(run.run.summary.rmsMean)}</div>
            <div>Recenters: {run.run.summary.recenterCount}</div>
          </>
        ) : (
          <div>No HUD telemetry loaded.</div>
        )}
        {run.round ? (
          <div>Round: {run.round.totalScore} (par {run.round.totalPar}) · {relativeText}</div>
        ) : null}
      </div>
    </button>
  );
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return Number.isFinite(value) ? value.toFixed(2) : String(value);
}

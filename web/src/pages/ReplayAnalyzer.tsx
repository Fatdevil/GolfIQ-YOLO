import { useCallback, useMemo, useState } from "react";

import { BenchCompare } from "../features/replay/components/BenchCompare";
import { DispersionPlot, type DispersionSeries } from "../features/replay/components/DispersionPlot";
import { MetricChart } from "../features/replay/components/MetricChart";
import { RunTimeline } from "../features/replay/components/RunTimeline";
import { RunUpload, type LoadedRun, type RunSlot } from "../features/replay/components/RunUpload";
import { ShotStatsTable } from "../features/replay/components/ShotStatsTable";
import type { BenchSummary } from "../features/replay/utils/parseBenchSummary";
import { computeDispersion, type DispersionStats } from "../features/replay/utils/parseShotLog";
import { mkReportMd } from "../features/replay/utils/mkReportMd";

export default function ReplayAnalyzerPage() {
  const [primary, setPrimary] = useState<LoadedRun | null>(null);
  const [comparison, setComparison] = useState<LoadedRun | null>(null);
  const [activeSlot, setActiveSlot] = useState<RunSlot>("primary");
  const [benchSummary, setBenchSummary] = useState<BenchSummary>({});
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = useCallback(() => {
    if (!primary) {
      setExportError("Load a primary run first");
      return;
    }
    try {
      const dispersion = computeDispersion(primary.shots);
      const markdown = mkReportMd(primary.run, benchSummary, dispersion);
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

  const activeRun = useMemo(() => {
    if (activeSlot === "comparison") {
      return comparison ?? primary;
    }
    return primary ?? comparison;
  }, [activeSlot, comparison, primary]);

  const activeHud = activeRun?.run ?? null;

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
    if (primary && primaryStats) {
      const sessionId = primary.run.summary.sessionId ?? "primary";
      entries.push({
        id: `primary-${sessionId}`,
        label: `Primary · ${sessionId}`,
        color: "#34d399",
        shots: primary.shots,
        stats: primaryStats,
      });
    }
    if (comparison && comparisonStats) {
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

  const isPrimaryActive = Boolean(primary && activeRun?.run === primary.run);
  const isComparisonActive = Boolean(comparison && activeRun?.run === comparison.run);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-100">Replay analyzer</h1>
        <p className="text-sm text-slate-400">
          Inspect exported hud_run.json captures, visualise frame metrics, and compare against bench defaults.
        </p>
      </header>

      <RunUpload
        onRunLoaded={(payload, slot) => {
          if (slot === "primary") {
            setPrimary(payload);
            setExportError(null);
          } else {
            setComparison(payload);
          }
          setActiveSlot(slot);
        }}
      />

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
                  Active run: {activeRun?.run.summary.sessionId ?? "n/a"}
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
          Load a hud_run.json file to see charts and metrics.
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
  run: LoadedRun;
  stats: DispersionStats | null;
  active: boolean;
  onSelect: () => void;
};

function RunSummaryCard({ label, run, stats, active, onSelect }: RunSummaryCardProps) {
  const summary = run.run.summary;
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
          <p className="text-lg font-semibold text-slate-100">{summary.sessionId ?? "n/a"}</p>
          <p className="text-xs text-slate-400">
            {summary.device ?? "device unknown"} · {summary.os ?? "os unknown"}
          </p>
        </div>
        <div className="text-right text-xs text-slate-300">
          <div>Shots: {stats ? stats.count : 0}</div>
          <div>Avg carry: {stats ? formatNumber(stats.avgCarry) : "n/a"} m</div>
        </div>
      </div>
      <div className="mt-3 grid gap-1 text-xs text-slate-300">
        <div>Avg FPS: {formatNumber(summary.avgFps)}</div>
        <div>Latency p95: {formatNumber(summary.p95Latency)} ms</div>
        <div>RMS mean: {formatNumber(summary.rmsMean)}</div>
        <div>Recenters: {summary.recenterCount}</div>
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

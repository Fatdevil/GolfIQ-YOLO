import { useCallback, useMemo, useState } from "react";

import { BenchCompare } from "../features/replay/components/BenchCompare";
import { MetricChart } from "../features/replay/components/MetricChart";
import { RunTimeline } from "../features/replay/components/RunTimeline";
import { RunUpload } from "../features/replay/components/RunUpload";
import type { BenchSummary } from "../features/replay/utils/parseBenchSummary";
import type { ParsedHudRun } from "../features/replay/utils/parseHudRun";
import { mkReportMd } from "../features/replay/utils/mkReportMd";

export default function ReplayAnalyzerPage() {
  const [run, setRun] = useState<ParsedHudRun | null>(null);
  const [benchSummary, setBenchSummary] = useState<BenchSummary>({});
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = useCallback(() => {
    if (!run) {
      setExportError("Load a run first");
      return;
    }
    try {
      const markdown = mkReportMd(run, benchSummary);
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const fileName = `${run.summary.sessionId ?? "hud-run"}.md`;
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
  }, [benchSummary, run]);

  const fpsSeries = useMemo(() => {
    if (!run) return [];
    return run.frames.map((frame) => ({
      timeSec: frame.timeSec,
      value: frame.fps ?? null,
    }));
  }, [run]);

  const latencySeries = useMemo(() => {
    if (!run) return [];
    return run.frames.map((frame) => ({
      timeSec: frame.timeSec,
      value: frame.latencyMs ?? null,
    }));
  }, [run]);

  const rmsSeries = useMemo(() => {
    if (!run) return [];
    return run.frames.map((frame) => ({
      timeSec: frame.timeSec,
      value: frame.rms ?? null,
    }));
  }, [run]);

  const headingSeries = useMemo(() => {
    if (!run) return [] as Array<{ timeSec: number; heading?: number | null }>;
    return run.frames.map((frame) => ({
      timeSec: frame.timeSec,
      heading: frame.headingSmoothed ?? frame.headingRaw ?? null,
    }));
  }, [run]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-100">Replay analyzer</h1>
        <p className="text-sm text-slate-400">
          Inspect exported hud_run.json captures, visualise frame metrics, and compare against bench defaults.
        </p>
      </header>

      <RunUpload
        onRunLoaded={(parsed) => {
          setRun(parsed);
          setExportError(null);
        }}
      />

      {run ? (
        <section className="space-y-6">
          <div className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Run summary</h2>
              <p className="text-sm text-slate-400">
                Session {run.summary.sessionId ?? "n/a"} · {run.summary.device ?? "device unknown"} · {run.summary.os ?? "os unknown"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 text-sm text-slate-300">
              <div>Avg FPS: {formatNumber(run.summary.avgFps)}</div>
              <div>Latency p95: {formatNumber(run.summary.p95Latency)} ms</div>
              <div>RMS mean: {formatNumber(run.summary.rmsMean)}</div>
              <div>Recenters: {run.summary.recenterCount}</div>
            </div>
          </div>

          <RunTimeline
            segments={run.timeline}
            totalDurationMs={run.summary.durationMs ?? 0}
            recenterIntervals={run.recenterIntervals}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <MetricChart
              title="Frame rate"
              color="#34d399"
              data={fpsSeries}
              unit="fps"
              recenterIntervals={run.recenterIntervals.map((interval) => ({
                startSec: interval.startSec,
                endSec: interval.endSec,
              }))}
            />
            <MetricChart
              title="Latency"
              color="#f97316"
              data={latencySeries}
              unit="ms"
              recenterIntervals={run.recenterIntervals.map((interval) => ({
                startSec: interval.startSec,
                endSec: interval.endSec,
              }))}
            />
            <MetricChart
              title="Heading RMS"
              color="#60a5fa"
              data={rmsSeries}
              unit="deg"
              recenterIntervals={run.recenterIntervals.map((interval) => ({
                startSec: interval.startSec,
                endSec: interval.endSec,
              }))}
            />
            <MetricChart
              title="Heading"
              color="#c084fc"
              data={headingSeries.map((sample) => ({ timeSec: sample.timeSec, value: sample.heading ?? null }))}
              unit="deg"
              recenterIntervals={run.recenterIntervals.map((interval) => ({
                startSec: interval.startSec,
                endSec: interval.endSec,
              }))}
            />
          </div>

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

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return Number.isFinite(value) ? value.toFixed(2) : String(value);
}

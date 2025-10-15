import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchBenchSummary } from "../../../api";
import type { BenchSummary, BenchSummaryPlatformConfig } from "../utils/parseBenchSummary";
import { parseBenchSummary } from "../utils/parseBenchSummary";

interface BenchCompareProps {
  onSummaryLoaded?: (summary: BenchSummary) => void;
}

type BenchRunMetrics = {
  platform?: string | null;
  runtime?: string | null;
  inputSize?: number | null;
  quant?: string | null;
  threads?: number | null;
  delegate?: string | null;
  fpsAvg?: number | null;
  p50?: number | null;
  p95?: number | null;
  batteryDelta?: number | null;
  memDelta?: number | null;
  thermal?: string | null;
  durationMs?: number | null;
  framesMeasured?: number | null;
};

export function BenchCompare({ onSummaryLoaded }: BenchCompareProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BenchSummary>({});
  const [input, setInput] = useState("");
  const [benchRun, setBenchRun] = useState<BenchRunMetrics | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchBenchSummary();
      const parsed = parseBenchSummary(response);
      setSummary(parsed);
      onSummaryLoaded?.(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onSummaryLoaded]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const parseBenchRun = useCallback(() => {
    if (!input.trim()) {
      setBenchRun(null);
      setParseError("Paste bench_run.json to compare");
      return;
    }
    try {
      const raw = JSON.parse(input);
      const payload =
        (raw && typeof raw === "object" && "payload" in raw
          ? (raw as Record<string, unknown>)["payload"]
          : raw) ?? {};
      if (!payload || typeof payload !== "object") {
        throw new Error("bench_run payload missing");
      }
      const record = payload as Record<string, unknown>;
      const metrics = (raw as Record<string, unknown>)["metrics"];
      setBenchRun({
        platform: pickString(record["platform"]),
        runtime: pickString(record["runtime"]),
        inputSize: pickNumber(record["inputSize"]),
        quant: pickString(record["quant"]),
        threads: pickNumber(record["threads"]),
        delegate: pickString(record["delegate"]),
        fpsAvg: pickNumber(record["fpsAvg"] ?? (metrics as Record<string, unknown> | undefined)?.["fpsAvg"]),
        p50: pickNumber(record["p50"] ?? (metrics as Record<string, unknown> | undefined)?.["p50"]),
        p95: pickNumber(record["p95"] ?? (metrics as Record<string, unknown> | undefined)?.["p95"]),
        batteryDelta: pickNumber(
          record["batteryDelta"] ?? (metrics as Record<string, unknown> | undefined)?.["batteryDelta"],
        ),
        memDelta: pickNumber(record["memDelta"] ?? (metrics as Record<string, unknown> | undefined)?.["memDelta"]),
        thermal: pickString(record["thermal"] ?? (metrics as Record<string, unknown> | undefined)?.["thermal"]),
        durationMs: pickNumber(
          record["durationMs"] ?? (metrics as Record<string, unknown> | undefined)?.["durationMs"],
        ),
        framesMeasured: pickNumber(
          record["framesMeasured"] ?? (metrics as Record<string, unknown> | undefined)?.["framesMeasured"],
        ),
      });
      setParseError(null);
    } catch (err) {
      setBenchRun(null);
      setParseError(err instanceof Error ? err.message : String(err));
    }
  }, [input]);

  const comparison = useMemo(() => {
    if (!benchRun?.platform) return null;
    const platform = benchRun.platform.toLowerCase();
    const match = summary[platform] ?? summary[benchRun.platform] ?? null;
    return match;
  }, [benchRun, summary]);

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">Bench compare</h2>
        <button
          type="button"
          onClick={loadSummary}
          className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200 hover:bg-slate-700"
        >
          Refresh
        </button>
      </header>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Current summary</h3>
        {loading && <p className="mt-2 text-xs text-slate-500">Loading…</p>}
        {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
        {!loading && !error && (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-2 py-1">Platform</th>
                  <th className="px-2 py-1">Runtime</th>
                  <th className="px-2 py-1">Input</th>
                  <th className="px-2 py-1">Quant</th>
                  <th className="px-2 py-1">Threads</th>
                  <th className="px-2 py-1">Delegate</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary).map(([platform, config]) => (
                  <tr key={platform} className="border-t border-slate-800 text-slate-200">
                    <td className="px-2 py-2 font-medium capitalize">{platform}</td>
                    <td className="px-2 py-2">{config.runtime}</td>
                    <td className="px-2 py-2">{config.inputSize}</td>
                    <td className="px-2 py-2 uppercase">{config.quant}</td>
                    <td className="px-2 py-2">{config.threads}</td>
                    <td className="px-2 py-2">{config.delegate ?? "-"}</td>
                  </tr>
                ))}
                {Object.keys(summary).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-2 py-3 text-sm text-slate-500">
                      No bench summary found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Compare a bench run</h3>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={6}
          placeholder="Paste bench_run.json contents"
          className="mt-3 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
        />
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>{parseError ?? "Press analyze to parse the sample"}</span>
          <button
            type="button"
            onClick={parseBenchRun}
            className="rounded bg-emerald-500 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-950 hover:bg-emerald-400"
          >
            Analyze
          </button>
        </div>
        {benchRun && (
          <div className="mt-4 space-y-2 text-sm text-slate-200">
            <h4 className="font-semibold uppercase tracking-wide text-slate-400">Run metrics</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <Metric label="Platform" value={benchRun.platform ?? "n/a"} />
              <Metric label="Runtime" value={benchRun.runtime ?? "n/a"} />
              <Metric label="Input" value={benchRun.inputSize ?? "n/a"} />
              <Metric label="Quant" value={benchRun.quant ?? "n/a"} />
              <Metric label="Threads" value={benchRun.threads ?? "n/a"} />
              <Metric label="Delegate" value={benchRun.delegate ?? "-"} />
              <Metric label="FPS avg" value={fmtNumber(benchRun.fpsAvg)} />
              <Metric label="Latency p95" value={fmtNumber(benchRun.p95)} suffix="ms" />
              <Metric label="Latency p50" value={fmtNumber(benchRun.p50)} suffix="ms" />
              <Metric label="Frames" value={benchRun.framesMeasured ?? "n/a"} />
              <Metric label="Duration" value={fmtDuration(benchRun.durationMs)} />
              <Metric label="Battery Δ" value={fmtNumber(benchRun.batteryDelta)} suffix="%" />
              <Metric label="Memory Δ" value={fmtNumber(benchRun.memDelta)} suffix="MB" />
              <Metric label="Thermal" value={benchRun.thermal ?? "n/a"} />
            </div>
            {comparison && (
              <div className="mt-3 rounded border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-300">
                <p className="font-semibold text-slate-200">Recommended config</p>
                <p>
                  {renderConfigSummary(comparison)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }
  return Number.isFinite(value) ? value.toFixed(2) : String(value);
}

function fmtDuration(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "n/a";
  }
  return `${(value / 1000).toFixed(2)} s`;
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function Metric({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-100">
        {typeof value === "number" ? value.toString() : value}
        {suffix && value !== "n/a" ? ` ${suffix}` : ""}
      </div>
    </div>
  );
}

function renderConfigSummary(config: BenchSummaryPlatformConfig): string {
  const parts = [
    `${config.runtime}`,
    `${config.inputSize}px`,
    `${config.quant}`,
    `${config.threads} threads`,
  ];
  if (config.delegate) {
    parts.push(`${config.delegate} delegate`);
  }
  return parts.join(" • ");
}

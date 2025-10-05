import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
  Legend,
} from "recharts";

type MetricKey = "ballSpeed" | "sideAngle" | "carry";

interface MetricCheck {
  value: number | null;
  limit: number;
  pass: boolean;
}

interface MetricSummary {
  count: number;
  missing: number;
  mae: number | null;
  mape: number | null;
  p50: number | null;
  p95: number | null;
  max: number | null;
  checks: Record<string, MetricCheck>;
  pass: boolean;
}

interface ClipReport {
  id: string;
  file: string;
  expected: Partial<Record<MetricKey, number | null>> & Record<string, number | null>;
  actual: Partial<Record<MetricKey, number | null>> & Record<string, number | null>;
  errors: Partial<Record<MetricKey, number | null>> & Record<string, number | null>;
}

interface AccuracyReport {
  dataset: string;
  version?: string;
  generatedAt?: string;
  thresholds: Partial<Record<MetricKey, Record<string, number>>> &
    Record<string, Record<string, number>>;
  metrics: Partial<Record<MetricKey, MetricSummary>> & Record<string, MetricSummary>;
  clips: ClipReport[];
  passed: boolean;
  missingValuesDetected?: boolean;
}

interface MetricDescriptor {
  key: MetricKey;
  label: string;
  unit: string;
  description: string;
  barColor: string;
}

const METRICS: MetricDescriptor[] = [
  {
    key: "ballSpeed",
    label: "Ball speed",
    unit: "m/s",
    description: "Mean absolute error on ball speed readings.",
    barColor: "#34d399",
  },
  {
    key: "sideAngle",
    label: "Side angle",
    unit: "deg",
    description: "Deviation of side angle compared to golden swings.",
    barColor: "#60a5fa",
  },
  {
    key: "carry",
    label: "Carry",
    unit: "m",
    description: "Carry estimate variance against the baseline.",
    barColor: "#f59e0b",
  },
];

const REPORT_URL = import.meta.env.VITE_ACCURACY_REPORT ?? "/reports/accuracy.json";

export default function AccuracyBoardPage() {
  const [report, setReport] = useState<AccuracyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setError(null);
    fetch(REPORT_URL, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load accuracy report (${res.status})`);
        }
        return (await res.json()) as AccuracyReport;
      })
      .then((payload) => {
        if (!aborted) {
          setReport(payload);
        }
      })
      .catch((err: unknown) => {
        if (!aborted) {
          console.error(err);
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, []);

  const generatedAt = useMemo(() => {
    if (!report?.generatedAt) return null;
    try {
      return new Date(report.generatedAt).toLocaleString();
    } catch (err) {
      console.warn("Failed to parse generatedAt", err);
      return report.generatedAt;
    }
  }, [report]);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Accuracy board</h1>
          <p className="text-sm text-slate-400">
            Track analyzer accuracy against the golden swing dataset.
          </p>
        </div>
        <div className="rounded-full border border-slate-700 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200">
          {report?.passed ? "PASS" : "PENDING"}
        </div>
      </header>

      {generatedAt && (
        <p className="text-xs text-slate-500">
          Last generated: <span className="font-semibold text-slate-300">{generatedAt}</span>
        </p>
      )}

      {loading && (
        <div className="rounded border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
          Loading accuracy report…
        </div>
      )}

      {error && !loading && (
        <div className="rounded border border-red-800/60 bg-red-950/50 p-6 text-sm text-red-200">
          {error}
        </div>
      )}

      {!loading && !error && report && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {METRICS.map((metric) => {
              const summary = report.metrics?.[metric.key];
              const thresholds = report.thresholds?.[metric.key] ?? {};
              const clipSeries = report.clips.map((clip) => ({
                clip: clip.id,
                error: clip.errors?.[metric.key] ?? 0,
              }));
              const passLabel = summary?.pass ? "Pass" : "Fail";
              return (
                <div
                  key={metric.key}
                  className="flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-100">{metric.label}</h2>
                      <p className="text-xs text-slate-400">{metric.description}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        summary?.pass ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"
                      }`}
                    >
                      {passLabel}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm text-slate-300">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">MAE</dt>
                      <dd className="font-mono text-base">
                        {formatNumber(summary?.mae)} {metric.unit}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">P95</dt>
                      <dd className="font-mono text-base">
                        {formatNumber(summary?.p95)} {metric.unit}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">MAPE</dt>
                      <dd className="font-mono text-base">
                        {summary?.mape != null ? `${(summary.mape * 100).toFixed(2)}%` : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Thresholds</dt>
                      <dd className="text-xs">
                        {Object.entries(thresholds).map(([key, value]) => (
                          <span key={key} className="mr-2 inline-flex items-center gap-1">
                            <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                              {key}
                            </span>
                            <span className="font-mono text-slate-200">{formatNumber(value)}</span>
                          </span>
                        ))}
                      </dd>
                    </div>
                  </dl>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={clipSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="clip" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            border: "1px solid #1e293b",
                            borderRadius: 8,
                            color: "#e2e8f0",
                          }}
                          formatter={(value: number) => `${value.toFixed(3)} ${metric.unit}`}
                        />
                        <Legend wrapperStyle={{ color: "#cbd5f5" }} />
                        {Object.entries(thresholds).map(([key, value]) => (
                          <ReferenceLine
                            key={key}
                            y={value}
                            stroke={key === "p95" ? "#f87171" : "#38bdf8"}
                            strokeDasharray="4 4"
                            label={{
                              position: "right",
                              value: key.toUpperCase(),
                              fill: "#94a3b8",
                              fontSize: 10,
                            }}
                          />
                        ))}
                        <Bar dataKey="error" name="Abs error" fill={metric.barColor} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-lg font-semibold text-slate-100">Clip breakdown</h2>
            <p className="text-xs text-slate-400">
              Each swing vs. golden expectations. Values are absolute errors per metric.
            </p>
            <div className="overflow-x-auto">
              <table className="mt-4 w-full min-w-[480px] divide-y divide-slate-800 text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2">Clip</th>
                    {METRICS.map((metric) => (
                      <th key={metric.key} className="py-2">
                        {metric.label} ({metric.unit})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {report.clips.map((clip) => (
                    <tr key={clip.id} className="hover:bg-slate-800/40">
                      <td className="py-2 font-mono text-xs text-slate-400">{clip.id}</td>
                      {METRICS.map((metric) => (
                        <td key={metric.key} className="py-2 font-mono text-xs">
                          {formatNumber(clip.errors?.[metric.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1) return value.toFixed(3);
  if (Math.abs(value) >= 0.01) return value.toFixed(4);
  return value.toExponential(2);
}

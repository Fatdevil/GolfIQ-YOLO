import { useEffect, useMemo, useState } from "react";

import {
  fetchSwingMetrics,
  type MetricValue,
  type NormalisedSwingMetricsResponse,
  type TourCompare,
  type TourStatus,
} from "@/api";

interface SwingDiagnosticsPanelProps {
  runId: string;
}

interface MetricConfig {
  keys: string[];
  label: string;
  helper?: string;
}

interface ResolvedMetric {
  key: string;
  label: string;
  metric: MetricValue;
  compare?: TourCompare;
  helper?: string;
}

const METRIC_CONFIG: MetricConfig[] = [
  {
    keys: ["max_shoulder_rotation"],
    label: "Shoulder rotation (top)",
    helper:
      "Tour players often turn their shoulders 70–100°. Enough rotation without losing posture helps create depth and speed.",
  },
  {
    keys: ["max_hip_rotation"],
    label: "Hip rotation (top)",
    helper: "Hips typically rotate 40–60° while staying in balance. Over-rotation can open the body early.",
  },
  {
    keys: ["max_x_factor"],
    label: "X-factor (shoulders vs hips)",
    helper:
      "X-factor separation of ~30–50° can store energy. More is not always better unless sequence and timing support it.",
  },
  {
    keys: ["launch_deg", "vertLaunchDeg", "launchDeg"],
    label: "Launch angle",
    helper: "Launch window that fits the club and speed keeps spin down and carry up.",
  },
  {
    keys: ["sideAngleDeg", "side_angle_deg"],
    label: "Side angle",
    helper: "Side-to-side start direction. Big misses here often relate to face-to-path or aim issues.",
  },
  {
    keys: ["sway_px", "sway_cm"],
    label: "Lead-side sway",
    helper: "Small lateral sway keeps pressure forward without sliding. Too much can cause early extension or timing issues.",
  },
];

const STATUS_COPY: Record<
  TourStatus,
  {
    label: string;
    className: string;
    rangeClassName: string;
  }
> = {
  below: {
    label: "Below tour range",
    className:
      "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-100",
    rangeClassName: "text-amber-200",
  },
  in_range: {
    label: "Within tour range",
    className:
      "inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-100",
    rangeClassName: "text-emerald-200",
  },
  above: {
    label: "Above tour range",
    className:
      "inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-100",
    rangeClassName: "text-rose-200",
  },
};

function formatMetricValue(metric: MetricValue | undefined): string {
  if (!metric) return "–";
  if (!Number.isFinite(metric.value)) return "–";
  const digits = Math.abs(metric.value) >= 100 ? 0 : 1;
  return metric.value.toFixed(digits);
}

function resolveMetrics(response: NormalisedSwingMetricsResponse | null): ResolvedMetric[] {
  if (!response) return [];
  const metrics = response.metrics ?? {};
  const compare = response.tourCompare ?? {};

  const resolved: ResolvedMetric[] = [];

  METRIC_CONFIG.forEach((config) => {
    const foundKey = config.keys.find((key) => metrics[key]);
    if (!foundKey) return;
    resolved.push({
      key: foundKey,
      label: config.label,
      metric: metrics[foundKey],
      compare: compare[foundKey],
      helper: config.helper,
    });
  });

  return resolved;
}

export default function SwingDiagnosticsPanel({ runId }: SwingDiagnosticsPanelProps) {
  const [data, setData] = useState<NormalisedSwingMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSwingMetrics(runId)
      .then((resp) => {
        if (cancelled) return;
        setData(resp);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || "Failed to load swing metrics");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [runId]);

  const resolvedMetrics = useMemo(() => resolveMetrics(data), [data]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
        <div className="text-sm font-semibold text-slate-100">Swing diagnostics & tour comparison</div>
        <div className="mt-2 h-4 w-40 animate-pulse rounded bg-slate-800/70" />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[...Array(4)].map((_, idx) => (
            <div key={idx} className="h-16 animate-pulse rounded-lg bg-slate-800/50" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-900/30 p-4 text-sm text-red-100 shadow">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-red-50">Swing diagnostics unavailable</div>
            <p className="mt-1 text-red-100/80">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(null);
              fetchSwingMetrics(runId)
                .then(setData)
                .catch((err: Error) => setError(err.message || "Failed to load swing metrics"))
                .finally(() => setLoading(false));
            }}
            className="rounded-md border border-red-400/60 bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-50 hover:bg-red-500/30"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const clubLabel = data?.club?.trim();

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">Swing diagnostics & tour comparison</div>
          <p className="text-xs text-slate-400">
            Quick check of key swing positions against tour reference bands.
            {clubLabel ? ` Club: ${clubLabel}` : ""}
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-200">
          CV analysis
        </span>
      </div>

      {!resolvedMetrics.length ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
          No swing metrics available for this run yet. Make sure CV analysis ran successfully.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {resolvedMetrics.map((item) => {
            const statusMeta = item.compare ? STATUS_COPY[item.compare.status] : null;
            const rangeMin = item.compare?.rangeMin;
            const rangeMax = item.compare?.rangeMax;
            const hasRange = typeof rangeMin === "number" && typeof rangeMax === "number";
            const rangeText = hasRange
              ? `Tour range ${rangeMin.toFixed(1)}–${rangeMax.toFixed(1)}`
              : "No tour reference yet";
            return (
              <div
                key={item.key}
                className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{item.label}</div>
                    {item.helper && <p className="text-xs text-slate-400">{item.helper}</p>}
                  </div>
                  {statusMeta ? (
                    <span className={statusMeta.className}>{statusMeta.label}</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-slate-800 bg-slate-800/60 px-2 py-1 text-[11px] font-medium text-slate-300">
                      No tour ref
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-emerald-200">
                    {formatMetricValue(item.metric)}
                  </span>
                  {item.metric?.units && <span className="text-sm text-slate-400">{item.metric.units}</span>}
                </div>
                <div className="text-xs text-slate-400">
                  <span className={statusMeta?.rangeClassName ?? "text-slate-400"}>{rangeText}</span>
                  {item.compare?.bandGroup && (
                    <span className="ml-2 rounded-md bg-slate-800/80 px-2 py-[2px] text-[10px] uppercase tracking-wide text-slate-300">
                      {item.compare.bandGroup}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

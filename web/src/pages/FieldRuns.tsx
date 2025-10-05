import { useEffect, useState } from "react";
import { fetchFieldRuns, FieldRunMarker, FieldRunSummary } from "../api";

const EVENT_LABELS: Record<string, string> = {
  tee: "Tee",
  approach: "Approach",
  putt: "Putt",
  recenter: "Re-center",
  bundle_refresh: "Bundle refresh",
  run_start: "Run start",
};

function formatEvent(marker: FieldRunMarker) {
  return EVENT_LABELS[marker.event] ?? marker.event;
}

function formatHole(marker: FieldRunMarker) {
  if (typeof marker.hole === "number" && marker.hole > 0) {
    return `Hole ${marker.hole}`;
  }
  return "–";
}

function toDate(value: string | number | undefined): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTimestamp(value: string | number | undefined) {
  if (value === undefined || value === null || value === "") return "–";
  const date = toDate(value);
  if (!date) {
    return typeof value === "number" ? value.toString() : value;
  }
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatBatteryDelta(delta: number) {
  const rounded = delta.toFixed(1);
  return `${rounded}%`;
}

export default function FieldRunsPage() {
  const [runs, setRuns] = useState<FieldRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchFieldRuns()
      .then((data) => {
        if (!mounted) return;
        setRuns(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error(err);
        if (mounted) {
          setError("Failed to load field test runs.");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const content = (() => {
    if (loading) {
      return (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-300">
          Loading field runs…
        </div>
      );
    }
    if (error) {
      return (
        <div className="rounded-xl border border-red-500/40 bg-red-900/20 p-6 text-center text-sm text-red-200">
          {error}
        </div>
      );
    }
    if (runs.length === 0) {
      return (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-300">
          No field test runs captured yet. Enable Field Test Mode in the mobile HUD to begin recording.
        </div>
      );
    }
    return (
      <div className="space-y-6">
        {runs.map((run) => (
          <article
            key={run.runId}
            className="rounded-xl border border-slate-800 bg-slate-900/60 shadow-lg"
          >
            <header className="border-b border-slate-800/80 px-5 py-4">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-emerald-200">
                    Run {run.runId}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Started {formatTimestamp(run.startedAt)}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-4 text-xs text-slate-300 md:grid-cols-4">
                  <div>
                    <dt className="uppercase tracking-wide text-slate-500">Holes</dt>
                    <dd className="font-mono text-sm text-emerald-200">{run.holes}</dd>
                  </div>
                  <div>
                    <dt className="uppercase tracking-wide text-slate-500">Re-centers</dt>
                    <dd className="font-mono text-sm text-emerald-200">{run.recenterCount}</dd>
                  </div>
                  <div>
                    <dt className="uppercase tracking-wide text-slate-500">Avg FPS</dt>
                    <dd className="font-mono text-sm text-emerald-200">{run.avgFps.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt className="uppercase tracking-wide text-slate-500">Battery Δ</dt>
                    <dd className="font-mono text-sm text-emerald-200">{formatBatteryDelta(run.batteryDelta)}</dd>
                  </div>
                </dl>
              </div>
            </header>
            <div className="px-5 py-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
                  <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Event</th>
                      <th className="px-3 py-2 font-semibold">Hole</th>
                      <th className="px-3 py-2 font-semibold">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="bg-slate-950/40">
                    {run.markers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-3 py-4 text-center text-xs text-slate-400"
                        >
                          No markers recorded for this run.
                        </td>
                      </tr>
                    ) : (
                      run.markers
                        .slice()
                        .sort((a, b) => {
                          const timeA = toDate(a.timestamp)?.getTime() ?? 0;
                          const timeB = toDate(b.timestamp)?.getTime() ?? 0;
                          return timeA - timeB;
                        })
                        .map((marker, index) => (
                          <tr key={`${marker.event}-${marker.timestamp}-${index}`} className="border-t border-slate-800/60">
                            <td className="px-3 py-2 text-slate-200">{formatEvent(marker)}</td>
                            <td className="px-3 py-2 text-slate-300">{formatHole(marker)}</td>
                            <td className="px-3 py-2 text-slate-400">{formatTimestamp(marker.timestamp)}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  })();

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">Field runs</h1>
        <p className="text-sm text-slate-400">
          Review Field Test Mode summaries and the markers captured in each nine-hole ritual.
        </p>
      </header>
      {content}
    </section>
  );
}

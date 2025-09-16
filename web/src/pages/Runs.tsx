import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteRun, listRuns } from "../api";

interface RunSummary {
  run_id: string;
  created_ts?: string;
  source?: string;
  mode?: string;
  confidence?: number;
  ball_speed_mps?: number;
  [key: string]: unknown;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    listRuns()
      .then((data) => {
        if (!mounted) return;
        setRuns(Array.isArray(data) ? data : data?.items ?? []);
      })
      .catch((err) => {
        console.error(err);
        if (mounted) setError("Failed to load runs.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleDelete = async (runId: string) => {
    setBusyId(runId);
    const previous = runs;
    setRuns((current) => current.filter((run) => run.run_id !== runId));
    try {
      await deleteRun(runId);
    } catch (err) {
      console.error(err);
      setError(`Failed to delete run ${runId}.`);
      setRuns(previous);
    } finally {
      setBusyId(null);
    }
  };

  const renderBody = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
            Loading runs…
          </td>
        </tr>
      );
    }
    if (error) {
      return (
        <tr>
          <td colSpan={6} className="py-6 text-center text-sm text-red-300">
            {error}
          </td>
        </tr>
      );
    }
    if (runs.length === 0) {
      return (
        <tr>
          <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
            No runs available yet. Trigger an analyze to persist a run.
          </td>
        </tr>
      );
    }
    return runs.map((run) => {
      const created = run.created_ts ? new Date(run.created_ts) : null;
      return (
        <tr key={run.run_id} className="border-t border-slate-800/80">
          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-emerald-200">
            {run.run_id}
          </td>
          <td className="px-4 py-3 text-sm text-slate-300">
            {created ? created.toLocaleString() : "–"}
          </td>
          <td className="px-4 py-3 text-sm text-slate-300">{run.source ?? "–"}</td>
          <td className="px-4 py-3 text-sm text-slate-300">{run.mode ?? "–"}</td>
          <td className="px-4 py-3 text-sm text-slate-300">
            {typeof run.ball_speed_mps === "number" ? `${run.ball_speed_mps.toFixed(2)} m/s` : "–"}
          </td>
          <td className="px-4 py-3 text-right text-sm">
            <div className="flex justify-end gap-2">
              <Link
                to={`/runs/${run.run_id}`}
                className="rounded-md border border-emerald-500/40 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10"
              >
                View
              </Link>
              <button
                disabled={busyId === run.run_id}
                onClick={() => handleDelete(run.run_id)}
                className="rounded-md border border-red-500/40 px-3 py-1 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </td>
        </tr>
      );
    });
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Runs</h1>
        <p className="text-sm text-slate-400">
          Browse previously persisted runs and drill into their raw payloads.
        </p>
      </header>
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow-lg">
        <table className="min-w-full divide-y divide-slate-800/80 text-left text-sm">
          <thead className="bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Run ID</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Mode</th>
              <th className="px-4 py-3 font-semibold">Ball speed</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-slate-950/40">{renderBody()}</tbody>
        </table>
      </div>
    </section>
  );
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getRun } from "../api";

interface RunDetailData {
  run_id?: string;
  [key: string]: unknown;
}

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RunDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    getRun(id)
      .then((payload) => {
        if (!mounted) return;
        setData(payload);
      })
      .catch((err) => {
        console.error(err);
        if (mounted) setError("Failed to load run details.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Run detail</h1>
          <p className="text-sm text-slate-400">
            Inspect the raw payload produced by the analyzer.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/runs"
            className="rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800/80"
          >
            Back to runs
          </Link>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-md border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-200 opacity-60"
            title="Re-analyze coming soon"
          >
            Re-analyze
          </button>
        </div>
      </div>

      {loading && (
        <div className="rounded-md border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-300">
          Loading run…
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {!loading && data && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 shadow-lg">
          <div className="border-b border-slate-800 bg-slate-900/60 px-4 py-3 text-xs uppercase tracking-wide text-slate-400">
            Run payload
          </div>
          <pre className="overflow-x-auto bg-slate-950/90 px-4 py-4 text-xs leading-relaxed text-emerald-100">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { getRunDetailV1, resolveRunsError, type RunDetail } from "@/api/runsV1";
import { toast } from "@/ui/toast";

type Props = {
  runId: string | null;
  onClose: () => void;
};

export function RunDetailPanel({ runId, onClose }: Props) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    if (!runId) {
      setDetail(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    getRunDetailV1(runId)
      .then((response) => setDetail(response))
      .catch((err) => {
        const resolved = resolveRunsError(err, "Failed to load run detail");
        setError(resolved.message);
        toast.error(resolved.message);
      })
      .finally(() => setLoading(false));
  }, [runId]);

  const duration = useMemo(() => {
    if (!detail?.started_ts || !detail.finished_ts) return null;
    const ms = (detail.finished_ts - detail.started_ts) * 1000;
    if (!Number.isFinite(ms) || ms < 0) return null;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }, [detail?.finished_ts, detail?.started_ts]);

  if (!runId) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur">
      <div className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto border-l border-slate-800 bg-slate-900/95 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-50">{detail?.run_id ?? runId}</h2>
              {detail?.status ? (
                <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold capitalize text-slate-200">
                  {detail.status}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-400">Inspect run metadata, lifecycle timestamps, and diagnostics.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 p-6">
          {loading && <div className="text-sm text-slate-400">Loading run…</div>}
          {error && <div className="text-sm text-red-300">{error}</div>}

          {detail && (
            <>
              <section className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-200 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase text-slate-500">Timestamps</div>
                  <ul className="mt-1 space-y-1">
                    <li>Created: {formatDate(detail.created_at)}</li>
                    <li>Started: {formatDate(detail.started_at)}</li>
                    <li>Finished: {formatDate(detail.finished_at)}</li>
                    <li>Duration: {duration ?? "—"}</li>
                  </ul>
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-500">Metadata</div>
                  <ul className="mt-1 space-y-1">
                    <li>Kind: {detail.kind ?? "—"}</li>
                    <li>Source: {detail.source ?? "—"}</li>
                    <li>Model variant: {detail.model_variant_selected ?? "—"}</li>
                    <li>Override source: {detail.override_source ?? "—"}</li>
                  </ul>
                </div>
              </section>

              <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-200">
                <div className="text-xs uppercase text-slate-500">Input metadata</div>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-900/80 p-3 text-xs text-slate-100">
{JSON.stringify(detail.inputs ?? detail.input_ref ?? {}, null, 2)}
                </pre>
              </section>

              <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-200">
                <div className="text-xs uppercase text-slate-500">Timing</div>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-900/80 p-3 text-xs text-slate-100">
{JSON.stringify(detail.timings ?? detail.inference_timing ?? {}, null, 2)}
                </pre>
              </section>

              <section className="rounded-lg border border-amber-600/40 bg-amber-500/5 p-4 text-sm text-amber-100">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase text-amber-300">Failure</div>
                    <div className="mt-1 font-semibold">{detail.error_code ?? "No error code"}</div>
                    <div className="text-sm text-amber-200/90">
                      {detail.error_message ?? "No failure message recorded."}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-200">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase text-slate-500">Diagnostics (raw JSON)</div>
                  <button
                    className="text-xs font-semibold text-emerald-300 underline-offset-2 hover:underline"
                    onClick={() => setShowDiagnostics((value) => !value)}
                  >
                    {showDiagnostics ? "Hide" : "Show"}
                  </button>
                </div>
                {showDiagnostics ? (
                  <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900/80 p-3 text-xs text-slate-100">
{JSON.stringify(detail, null, 2)}
                  </pre>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">Diagnostics hidden.</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  try {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  } catch {
    return String(value);
  }
}

export default RunDetailPanel;

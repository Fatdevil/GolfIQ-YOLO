import { useCallback, useEffect, useMemo, useState } from "react";
import { getRunDetailV1, resolveRunsError, type RunDetailV1, type RunsError } from "@/api/runsV1";
import { copyToClipboard } from "@/utils/copy";
import { toast } from "@/ui/toast";

type Props = {
  runId: string | null;
  onClose: () => void;
};

type DetailState = "idle" | "loading" | "loaded" | "error";

const normalizeError = (error: unknown): RunsError => {
  if (error && typeof error === "object" && "message" in error) {
    return error as RunsError;
  }
  return resolveRunsError(error, "Failed to load run detail");
};

export function RunDetailPanel({ runId, onClose }: Props) {
  const [detail, setDetail] = useState<RunDetailV1 | null>(null);
  const [state, setState] = useState<DetailState>("idle");
  const [error, setError] = useState<RunsError | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const loadDetail = useCallback(
    async (currentRunId: string) => {
      setState("loading");
      setError(null);
      setDetail(null);
      try {
        const response = await getRunDetailV1(currentRunId);
        setDetail(response);
        setState("loaded");
      } catch (err) {
        const resolved = normalizeError(err);
        setError(resolved);
        setState("error");
        toast.error(resolved.message);
      }
    },
    [],
  );

  useEffect(() => {
    if (!runId) {
      setDetail(null);
      setError(null);
      setState("idle");
      return;
    }

    let cancelled = false;
    setState("loading");
    setError(null);
    setDetail(null);
    getRunDetailV1(runId)
      .then((response) => {
        if (cancelled) return;
        setDetail(response);
        setState("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        const resolved = normalizeError(err);
        setError(resolved);
        setState("error");
        toast.error(resolved.message);
      });

    return () => {
      cancelled = true;
    };
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

  const errorView = useMemo(() => {
    if (!error) return null;
    if (error.status === 401 || error.status === 403) {
      return {
        title: "Not authorized",
        description: "You are not authorized to view this run. Please sign in again.",
        retryable: false,
      };
    }
    if (error.status === 404) {
      return {
        title: "Run not found",
        description: `We couldn't find run ${runId ?? "selected"}. It may have been pruned or never existed.`,
        retryable: false,
      };
    }
    return {
      title: "Temporary error",
      description: error.message || "We hit a temporary issue loading this run.",
      retryable: true,
    };
  }, [error, runId]);

  const handleRetry = () => {
    if (runId) {
      loadDetail(runId);
    }
  };

  const handleCopyRunId = async () => {
    if (!runId) return;
    try {
      await copyToClipboard(runId);
      toast.success("Run id copied");
    } catch (err) {
      const resolved = normalizeError(err);
      toast.error(resolved.message || "Failed to copy run id");
    }
  };

  if (!runId) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur">
      <div className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto border-l border-slate-800 bg-slate-900/95 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-mono text-lg font-semibold text-emerald-200">{detail?.run_id ?? runId}</h2>
              {detail?.status ? (
                <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold capitalize text-slate-200">
                  {detail.status}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-400">Inspect run metadata, lifecycle timestamps, and diagnostics.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopyRunId}
              className="rounded-md border border-slate-700 px-3 py-1 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              Copy run id
            </button>
            <button
              onClick={onClose}
              className="rounded-md border border-slate-700 px-3 py-1 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-4 p-6">
          {state === "loading" && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
              Loading run…
            </div>
          )}

          {state === "error" && errorView && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
              <div className="text-sm font-semibold text-slate-50">{errorView.title}</div>
              <p className="mt-1 text-sm text-slate-300">{errorView.description}</p>
              {errorView.retryable ? (
                <button
                  onClick={handleRetry}
                  className="mt-3 rounded-md border border-emerald-500/40 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10"
                >
                  Retry
                </button>
              ) : null}
            </div>
          )}

          {detail && state === "loaded" && (
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
                    <li>Source type: {detail.source_type ?? "—"}</li>
                    <li>Model variant: {detail.model_variant_selected ?? detail.model_variant_requested ?? "—"}</li>
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

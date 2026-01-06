import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildRunDetailCurl, getRunDetailV1, resolveRunsError, type RunDetailV1, type RunsError } from "@/api/runsV1";
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

type ArtifactAction = {
  id: string;
  label: string;
  href?: string;
  copyText?: string;
  copyLabel: string;
  disabledReason?: string;
};

const formatPrimitiveValue = (value: unknown): string => {
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
};

const REFRESH_RETRY_DELAYS_MS = [500, 1000, 2000];
const isTestEnvironment = typeof import.meta !== "undefined" && Boolean((import.meta as { vitest?: unknown }).vitest);
const resolvedRetryDelays = isTestEnvironment ? [0, 0, 0] : REFRESH_RETRY_DELAYS_MS;

type LoadDetailResult =
  | { success: true }
  | { success: false; error?: RunsError }
  | {
      success: false;
      stale: true;
    };

const isRetryableRefreshStatus = (status?: number) => status === undefined || status >= 500;

const isEmptyDiagnosticsValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
};

export function RunDetailPanel({ runId, onClose }: Props) {
  const [detail, setDetail] = useState<RunDetailV1 | null>(null);
  const [state, setState] = useState<DetailState>("idle");
  const [error, setError] = useState<RunsError | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [refreshError, setRefreshError] = useState<RunsError | null>(null);
  const [isRetryingRefresh, setIsRetryingRefresh] = useState(false);
  const mountedRef = useRef(true);
  const requestSeqRef = useRef(0);
  const retryTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const loadDetail = useCallback(
    async (
      currentRunId: string,
      options?: {
        preserveData?: boolean;
        silenceErrorToast?: boolean;
      },
    ): Promise<LoadDetailResult> => {
      const requestId = ++requestSeqRef.current;
      const requestedRunId = currentRunId;
      const preserveData = options?.preserveData ?? false;
      const silenceErrorToast = options?.silenceErrorToast ?? false;
      if (preserveData) {
        setIsRefreshing(true);
        setRefreshError(null);
      } else {
        setState("loading");
        setError(null);
        setDetail(null);
      }
      try {
        const response = await getRunDetailV1(currentRunId);
        if (!mountedRef.current || requestId !== requestSeqRef.current || requestedRunId !== currentRunId) {
          return { success: false, stale: true };
        }
        setDetail(response);
        setState("loaded");
        setRefreshError(null);
        if (preserveData && mountedRef.current && requestId === requestSeqRef.current && requestedRunId === currentRunId) {
          toast.success("Updated");
        }
        return { success: true };
      } catch (err) {
        const resolved = normalizeError(err);
        if (!mountedRef.current || requestId !== requestSeqRef.current || requestedRunId !== currentRunId) {
          return { success: false, stale: true };
        }
        if (!preserveData) {
          setError(resolved);
          setState("error");
        }
        if (preserveData && isRetryableRefreshStatus(resolved.status)) {
          setRefreshError(resolved);
        } else if (preserveData) {
          setRefreshError(null);
        }
        if (!silenceErrorToast) {
          toast.error(resolved.message);
        }
        return { success: false, error: resolved };
      } finally {
        if (preserveData && mountedRef.current && requestId === requestSeqRef.current && requestedRunId === currentRunId) {
          setIsRefreshing(false);
        }
      }
    },
    [],
  );

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearRetryTimeout();
    setIsRetryingRefresh(false);
    setRefreshError(null);
    if (!runId) {
      setDetail(null);
      setError(null);
      setState("idle");
      return;
    }

    loadDetail(runId);
  }, [clearRetryTimeout, loadDetail, runId]);

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

  const handleCopyValue = async (value?: string) => {
    if (!value) return;
    try {
      await copyToClipboard(value);
      toast.success("Link copied");
    } catch (err) {
      const resolved = normalizeError(err);
      toast.error(resolved.message || "Failed to copy link");
    }
  };

  const handleCopyCurl = async () => {
    if (!runId) return;
    try {
      const command = buildRunDetailCurl(runId);
      await copyToClipboard(command);
      toast.success("cURL command copied");
    } catch (err) {
      const resolved = normalizeError(err);
      toast.error(resolved.message || "Failed to copy cURL");
    }
  };

  const handleCopyDiagnostics = async (payload: unknown) => {
    if (!payload) return;
    try {
      const serialized = JSON.stringify(payload, null, 2);
      await copyToClipboard(serialized);
      toast.success("Diagnostics copied");
    } catch (err) {
      const resolved = normalizeError(err);
      toast.error(resolved.message || "Failed to copy diagnostics");
    }
  };

  const handleRefresh = () => {
    if (!runId) return;
    clearRetryTimeout();
    setIsRetryingRefresh(false);
    setRefreshError(null);
    loadDetail(runId, { preserveData: true });
  };

  const performRefreshRetry = useCallback(
    async (attempt: number) => {
      if (!runId) {
        setIsRetryingRefresh(false);
        return;
      }
      const result = await loadDetail(runId, { preserveData: true, silenceErrorToast: attempt > 0 });
      if (result?.success) {
        setRefreshError(null);
        setIsRetryingRefresh(false);
        return;
      }
      const status = (result as { error?: RunsError })?.error?.status;
      if (!isRetryableRefreshStatus(status) || attempt >= 2) {
        setIsRetryingRefresh(false);
        return;
      }
      const delay = Math.min(4000, resolvedRetryDelays[attempt] ?? resolvedRetryDelays[resolvedRetryDelays.length - 1]);
      retryTimeoutRef.current = window.setTimeout(() => {
        void performRefreshRetry(attempt + 1);
      }, delay);
    },
    [loadDetail, runId],
  );

  const handleRefreshRetry = () => {
    if (!runId || !refreshError) return;
    clearRetryTimeout();
    setIsRetryingRefresh(true);
    void performRefreshRetry(0);
  };

  const artifactActions: ArtifactAction[] = useMemo(() => {
    if (!detail) return [];

    const actions: ArtifactAction[] = [];

    (detail.artifacts ?? []).forEach((artifact, index) => {
      const label = artifact.label || artifact.kind || artifact.key || `Artifact ${index + 1}`;
      const href = artifact.url;
      const copyText = artifact.url ?? artifact.key;
      actions.push({
        id: `artifact-${index}`,
        label,
        href,
        copyText,
        copyLabel: artifact.url ? "Copy link" : artifact.key ? "Copy key" : "Copy",
        disabledReason: href ? undefined : "URL unavailable",
      });
    });

    if (detail.media) {
      Object.entries(detail.media).forEach(([key, value], index) => {
        const label = humanizeLabel(key);
        const href = value;
        actions.push({
          id: `media-${key}-${index}`,
          label,
          href,
          copyText: value,
          copyLabel: "Copy link",
          disabledReason: href ? undefined : "Link unavailable",
        });
      });
    }

    return actions;
  }, [detail]);

  const diagnosticsPayload = useMemo(() => {
    if (!detail) return null;
    const diagnosticFields = (detail as RunDetailV1 & { diagnostics?: unknown; raw_payload?: unknown }).diagnostics;
    if (diagnosticFields && !isEmptyDiagnosticsValue(diagnosticFields)) {
      return diagnosticFields;
    }
    if (detail.metadata && !isEmptyDiagnosticsValue(detail.metadata)) {
      return detail.metadata;
    }
    const rawPayload = (detail as RunDetailV1 & { raw_payload?: unknown }).raw_payload;
    if (rawPayload && !isEmptyDiagnosticsValue(rawPayload)) {
      return rawPayload;
    }
    return null;
  }, [detail]);

  const hasDiagnostics = !!diagnosticsPayload && !isEmptyDiagnosticsValue(diagnosticsPayload);

  if (runId == null) return null;

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
              onClick={handleRefresh}
              disabled={state === "loading" || isRefreshing || isRetryingRefresh}
              className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-1 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
            >
              {isRefreshing ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
              ) : null}
              Refresh
            </button>
            <button
              onClick={handleCopyRunId}
              className="rounded-md border border-slate-700 px-3 py-1 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              Copy run id
            </button>
            <button
              onClick={handleCopyCurl}
              disabled={!runId}
              className="rounded-md border border-slate-700 px-3 py-1 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
              data-testid="copy-curl"
            >
              Copy cURL
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

          {state === "loaded" && refreshError ? (
            <div
              className="rounded-lg border border-amber-600/40 bg-amber-500/5 p-4 text-sm text-amber-100"
              data-testid="refresh-retry-banner"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase text-amber-300">Refresh failed</div>
                  <div className="text-sm text-amber-100/90">{refreshError.message}</div>
                </div>
                <button
                  onClick={handleRefreshRetry}
                  disabled={isRetryingRefresh || isRefreshing}
                  className="rounded-md border border-amber-500/60 px-3 py-1 text-xs font-semibold text-amber-50 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:border-amber-900 disabled:text-amber-200/50"
                  data-testid="refresh-retry-button"
                >
                  {isRetryingRefresh ? "Retrying…" : "Retry"}
                </button>
              </div>
            </div>
          ) : null}

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

              <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-200">
                <div className="text-xs uppercase text-slate-500">Artifacts / Links</div>
                {artifactActions.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">No artifacts available yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {artifactActions.map((artifact, index) => (
                      <div
                        key={artifact.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 bg-slate-900/80 px-3 py-2"
                        data-testid={`artifact-row-${index}`}
                      >
                        <div>
                          <div className="font-semibold text-slate-100">{artifact.label}</div>
                          {artifact.disabledReason ? (
                            <div className="text-xs text-slate-400">{artifact.disabledReason}</div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => openLink(artifact.href)}
                            disabled={!artifact.href}
                            className="rounded-md border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-100 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                            data-testid={`artifact-open-${index}`}
                          >
                            Open
                          </button>
                          <button
                            onClick={() => handleCopyValue(artifact.copyText)}
                            disabled={!artifact.copyText}
                            className="rounded-md border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-100 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
                            data-testid={`artifact-copy-${index}`}
                          >
                            {artifact.copyLabel}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                  <div className="text-xs uppercase text-slate-500">Diagnostics</div>
                  <div className="flex items-center gap-2">
                    {hasDiagnostics ? (
                      <button
                        className="text-xs font-semibold text-emerald-300 underline-offset-2 hover:underline"
                        onClick={() => handleCopyDiagnostics(diagnosticsPayload)}
                        data-testid="copy-diagnostics"
                      >
                        Copy JSON
                      </button>
                    ) : null}
                    <button
                      className="text-xs font-semibold text-emerald-300 underline-offset-2 hover:underline"
                      onClick={() => setShowDiagnostics((value) => !value)}
                      data-testid="toggle-diagnostics"
                    >
                      {showDiagnostics ? "Collapse" : "Expand"}
                    </button>
                  </div>
                </div>
                {!hasDiagnostics ? (
                  <p className="mt-2 text-xs text-slate-400">No diagnostics available.</p>
                ) : showDiagnostics ? (
                  <div className="mt-2 max-h-96 space-y-2 overflow-auto rounded bg-slate-900/80 p-3 text-xs text-slate-100">
                    <JsonTree data={diagnosticsPayload} />
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">Diagnostics collapsed.</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function JsonTree({ data }: { data: unknown }) {
  return <JsonTreeNode data={data} depth={0} />;
}

function JsonTreeNode({ data, depth }: { data: unknown; depth: number }) {
  if (data === null || typeof data !== "object") {
    return (
      <pre className="whitespace-pre-wrap break-all font-mono text-slate-100">
        {formatPrimitiveValue(data)}
      </pre>
    );
  }

  const isArray = Array.isArray(data);
  const entries = isArray
    ? (data as unknown[]).map((value, index) => ({ key: String(index), value }))
    : Object.entries(data as Record<string, unknown>).map(([key, value]) => ({ key, value }));

  return (
    <details
      open={depth === 0}
      className="rounded border border-slate-800/60 bg-slate-950/40"
      data-testid={depth === 0 ? "diagnostics-root" : undefined}
    >
      <summary className="cursor-pointer select-none px-2 py-1 font-mono text-slate-200">
        {isArray ? `Array(${entries.length})` : `Object(${entries.length})`}
      </summary>
      <div className="border-t border-slate-800/60 pl-3">
        {entries.map(({ key, value }) => (
          <div key={String(key)} className="space-y-1 py-1">
            <div className="font-mono text-emerald-200">{String(key)}</div>
            <JsonTreeNode data={value} depth={depth + 1} />
          </div>
        ))}
      </div>
    </details>
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

const humanizeLabel = (value: string): string =>
  value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Artifact";

const openLink = (href?: string) => {
  if (!href) return;
  window.open(href, "_blank", "noreferrer");
};

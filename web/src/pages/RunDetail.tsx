import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getRun } from "../api";
import TracerCanvas from "../components/TracerCanvas";
import GhostFrames from "../components/GhostFrames";
import { extractBackViewPayload } from "../lib/traceUtils";
import { visualTracerEnabled } from "../config";

interface RunDetailData {
  run_id?: string;
  impact_preview?: string | null;
  [key: string]: unknown;
}

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RunDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backView = useMemo(() => extractBackViewPayload(data), [data]);
  const qualityBadges = useMemo(() => {
    const badges: Array<{ key: string; value?: string }> = [];
    if (!backView?.quality) {
      return badges;
    }
    Object.entries(backView.quality).forEach(([key, value]) => {
      badges.push({ key, value: value ?? undefined });
    });
    return badges;
  }, [backView]);
  const headerSource = useMemo(() => {
    if (!data || typeof data !== "object") return null;
    const record = data as Record<string, unknown>;
    const headers = record.headers as Record<string, unknown> | undefined;
    if (headers) {
      const raw =
        headers["x-cv-source"] ??
        headers["X-CV-Source"] ??
        headers["x_cv_source"] ??
        headers["cv_source"];
      if (typeof raw === "string") {
        return raw;
      }
    }
    const meta =
      record["cv_source"] ??
      record["source"] ??
      (record["metadata"] as Record<string, unknown> | undefined)?.cv_source;
    return typeof meta === "string" ? meta : null;
  }, [data]);
  const pipelineSource = backView?.source ?? null;

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

      {!loading && data?.impact_preview && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
          Impact preview saved as{" "}
          <a
            href={String(data.impact_preview)}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-emerald-200 underline decoration-dotted"
          >
            impact_preview.zip
          </a>
          .
        </div>
      )}

      {!loading && visualTracerEnabled && backView && (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-800/60 bg-slate-950/60">
            {backView.videoUrl ? (
              <video
                src={backView.videoUrl}
                className="h-full w-full object-cover opacity-70"
                controls
                muted
                loop
                playsInline
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                Back-view preview not available
              </div>
            )}
            {backView.trace ? (
              <TracerCanvas trace={backView.trace} className="absolute inset-0" />
            ) : (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs uppercase tracking-wide text-slate-500">
                No tracer points provided
              </div>
            )}
            {backView.ghostFrames && backView.ghostFrames.length > 0 && (
              <GhostFrames frames={backView.ghostFrames} trace={backView.trace} className="absolute inset-0" />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {qualityBadges.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {qualityBadges.map((item) => (
                  <span
                    key={item.key}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200"
                  >
                    <span className="uppercase tracking-wide text-[0.65rem] text-emerald-300/80">
                      {item.key.replace(/[_-]/g, " ")}
                    </span>
                    {item.value && <span className="text-slate-200">{item.value}</span>}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-slate-500">No quality flags reported.</span>
            )}
            <div className="flex flex-col gap-1 text-xs text-slate-400">
              {pipelineSource && (
                <span>
                  Pipeline: <span className="font-mono text-slate-200">{pipelineSource}</span>
                </span>
              )}
              {headerSource && headerSource !== pipelineSource && (
                <span>
                  x-cv-source: <span className="font-mono text-slate-200">{headerSource}</span>
                </span>
              )}
            </div>
          </div>
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

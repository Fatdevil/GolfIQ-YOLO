import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getRun, postCoachFeedback, type CoachFeedbackResponse } from "../api";
import TracerCanvas from "../components/TracerCanvas";
import GhostFrames from "../components/GhostFrames";
import ExportPanel from "../components/ExportPanel";
import type { MetricOverlay } from "../lib/exportUtils";
import { extractBackViewPayload, mphFromMps, yardsFromMeters } from "../lib/traceUtils";
import { visualTracerEnabled } from "../config";

interface RunDetailData {
  run_id?: string;
  impact_preview?: string | null;
  [key: string]: unknown;
}

const renderCoachMarkdown = (text: string) => {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return blocks.map((block, index) => {
    const lines = block.split(/\n+/);
    const allBullets = lines.every((line) => /^\s*-\s+/.test(line));

    if (allBullets) {
      return (
        <ul
          key={`coach-list-${index}`}
          className="ml-4 list-disc space-y-1 text-sm text-emerald-100"
        >
          {lines.map((line, itemIndex) => (
            <li key={`coach-list-${index}-${itemIndex}`}>
              {line.replace(/^\s*-\s+/, "").trim()}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p key={`coach-paragraph-${index}`} className="text-sm leading-relaxed text-emerald-50">
        {block.replace(/\n+/g, " ")}
      </p>
    );
  });
};

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RunDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [coachResult, setCoachResult] = useState<CoachFeedbackResponse | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);

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

  const metricOverlays = useMemo<MetricOverlay[]>(() => {
    if (!data) return [];
    const sources: Record<string, unknown>[] = [];
    const pushIfRecord = (value: unknown) => {
      if (value && typeof value === "object") {
        sources.push(value as Record<string, unknown>);
      }
    };

    const root = data as Record<string, unknown>;
    pushIfRecord(root);
    pushIfRecord(root["metrics"]);
    const analysis = root["analysis"];
    if (analysis && typeof analysis === "object") {
      const analysisRecord = analysis as Record<string, unknown>;
      pushIfRecord(analysisRecord["metrics"]);
    }
    pushIfRecord(root["telemetry"]);
    const payload = root["payload"];
    if (payload && typeof payload === "object") {
      const payloadRecord = payload as Record<string, unknown>;
      pushIfRecord(payloadRecord["metrics"]);
    }

    const pickNumber = (value: unknown): number | undefined => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      return undefined;
    };

    const select = (keys: string[]): number | undefined => {
      for (const source of sources) {
        for (const key of keys) {
          if (source[key] !== undefined) {
            const value = pickNumber(source[key]);
            if (value !== undefined) {
              return value;
            }
          }
        }
      }
      return undefined;
    };

    const ballSpeedMps = select(["ballSpeedMps", "ball_speed_mps", "ballSpeed", "ball_speed"]);
    const clubSpeedMps = select(["clubSpeedMps", "club_speed_mps", "clubSpeed", "club_speed"]);
    const carryMeters = select(["carry", "carry_m", "carryMeters", "carry_meters"]);
    const sideAngle = select(["sideAngle", "side_angle", "side", "sideDeg", "side_deg"]);
    const vertLaunch = select(["vertLaunch", "launchAngle", "vert_launch", "launch_deg", "launchAngleDeg"]);

    const overlays: MetricOverlay[] = [];

    if (ballSpeedMps !== undefined) {
      const mph = mphFromMps(ballSpeedMps);
      overlays.push({
        label: "Ball Speed",
        value: `${ballSpeedMps.toFixed(2)} m/s`,
        secondary: mph !== undefined ? `${mph.toFixed(1)} mph` : undefined,
      });
    }

    if (clubSpeedMps !== undefined) {
      const mph = mphFromMps(clubSpeedMps);
      overlays.push({
        label: "Club Speed",
        value: `${clubSpeedMps.toFixed(2)} m/s`,
        secondary: mph !== undefined ? `${mph.toFixed(1)} mph` : undefined,
      });
    }

    if (carryMeters !== undefined) {
      const yards = yardsFromMeters(carryMeters);
      overlays.push({
        label: "Carry",
        value: `${carryMeters.toFixed(2)} m`,
        secondary: yards !== undefined ? `${yards.toFixed(1)} yd` : undefined,
      });
    }

    if (sideAngle !== undefined) {
      overlays.push({
        label: "Side Angle",
        value: `${sideAngle.toFixed(2)}°`,
      });
    }

    if (vertLaunch !== undefined) {
      overlays.push({
        label: "Launch",
        value: `${vertLaunch.toFixed(2)}°`,
      });
    }

    return overlays;
  }, [data]);

  const canExport = visualTracerEnabled && !!backView?.videoUrl && !!backView.trace;

  const handleCoachFeedback = useCallback(() => {
    if (!id) return;
    setCoachLoading(true);
    setCoachError(null);
    postCoachFeedback({ run_id: id })
      .then((res) => {
        setCoachResult(res);
      })
      .catch((err: unknown) => {
        console.error(err);
        const detail =
          typeof err === "object" && err && "response" in err
            ? (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
            : null;
        const message = typeof detail === "string" ? detail : "Unable to fetch coach feedback.";
        setCoachError(message);
      })
      .finally(() => {
        setCoachLoading(false);
      });
  }, [id]);

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

  useEffect(() => {
    setCoachResult(null);
    setCoachError(null);
    setCoachLoading(false);
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
          <button
            type="button"
            onClick={handleCoachFeedback}
            disabled={coachLoading || !id || loading}
            className="rounded-md border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {coachLoading ? "Getting Coach Feedback…" : "Get Coach Feedback"}
          </button>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            disabled={!canExport}
            className="rounded-md border border-sky-500/40 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export Traced Video
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

      {coachError && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          {coachError}
        </div>
      )}

      {coachLoading && !coachResult && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
          Requesting coach feedback…
        </div>
      )}

      {coachResult && (
        <div className="space-y-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 shadow-lg">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-emerald-300">
            <span>Coach feedback</span>
            <span className="font-mono text-emerald-200">
              {coachResult.provider} · {coachResult.latency_ms} ms
            </span>
          </div>
          {coachLoading && (
            <div className="text-[0.65rem] uppercase tracking-wide text-emerald-300/70">
              Refreshing…
            </div>
          )}
          <div className="space-y-3">{renderCoachMarkdown(coachResult.text)}</div>
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

      <ExportPanel
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        runId={id ?? null}
        videoUrl={backView?.videoUrl ?? null}
        trace={backView?.trace ?? null}
        metrics={metricOverlays}
      />
    </section>
  );
}

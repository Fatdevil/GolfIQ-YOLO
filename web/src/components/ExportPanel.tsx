import { useCallback, useEffect, useRef, useState } from "react";
import { TraceData } from "../lib/traceUtils";
import { getSignedPlaybackUrl } from "../media/sign";
import {
  MetricOverlay,
  drawMetricsOverlay,
  drawTraceOverlay,
  setupRecorder,
  startFramePump,
  waitForPlaybackEnd,
  waitForVideoMetadata,
} from "../lib/exportUtils";

type ExportState = "idle" | "preparing" | "recording" | "complete" | "error" | "canceled";

interface ExportPanelProps {
  isOpen: boolean;
  onClose: () => void;
  runId?: string | null;
  videoUrl?: string | null;
  trace?: TraceData | null;
  metrics?: MetricOverlay[];
}

const noop = () => {};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function ExportPanel({ isOpen, onClose, runId, videoUrl, trace, metrics = [] }: ExportPanelProps) {
  const [includeMetrics, setIncludeMetrics] = useState(metrics.length > 0);
  const [state, setState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [bytesRecorded, setBytesRecorded] = useState(0);
  const abortRef = useRef<() => void>(noop);

  useEffect(() => {
    if (!isOpen) {
      setState("idle");
      setProgress(0);
      setError(null);
      setDownloadUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      setDownloadName(null);
      setMimeType(null);
      setBytesRecorded(0);
    } else {
      setIncludeMetrics(metrics.length > 0);
    }
  }, [isOpen, metrics.length]);

  useEffect(() => () => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
  }, [downloadUrl]);

  const handleClose = useCallback(() => {
    if (state === "recording" || state === "preparing") {
      abortRef.current();
    }
    onClose();
  }, [state, onClose]);

  const startExport = useCallback(async () => {
    if (!videoUrl) {
      setError("No video available for this run");
      return;
    }
    try {
      setState("preparing");
      setProgress(0);
      setError(null);
      setBytesRecorded(0);

      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      const playback = await getSignedPlaybackUrl(videoUrl);
      video.src = playback.url;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";

      await waitForVideoMetadata(video);

      const width = video.videoWidth;
      const height = video.videoHeight;

      if (!width || !height) {
        throw new Error("Unable to read video dimensions");
      }

      video.currentTime = 0;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });

      if (!ctx) {
        throw new Error("Failed to create drawing context");
      }

      const { recorder, mimeType: selectedMime } = setupRecorder(canvas, {
        preferMp4: true,
        videoBitsPerSecond: Math.min(12_000_000, width * height * 12),
      });

      setMimeType(selectedMime);

      const chunks: Blob[] = [];
      let stopped = false;
      let canceled = false;

      recorder.ondataavailable = (event) => {
        if (!event.data || !event.data.size) return;
        chunks.push(event.data);
        setBytesRecorded((value) => value + event.data.size);
      };

      const finalize = () => {
        if (stopped) return;
        stopped = true;
        recorder.stop();
      };

      abortRef.current = () => {
        stopped = true;
        canceled = true;
        try {
          recorder.stop();
        } catch (err) {
          console.warn("Error stopping recorder", err);
        }
        video.pause();
        setState("canceled");
      };

      const drawFrame = () => {
        ctx.drawImage(video, 0, 0, width, height);
        if (trace) {
          drawTraceOverlay(ctx, trace, width, height);
        }
        if (includeMetrics && metrics.length) {
          drawMetricsOverlay(ctx, metrics, width);
        }
        if (video.duration) {
          setProgress(Math.min(video.currentTime / video.duration, 1));
        }
      };

      setState("recording");
      const recorderStopPromise = new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
      });

      recorder.start(1000);

      const stopPump = startFramePump(video, drawFrame);

      const playbackPromise = waitForPlaybackEnd(video).finally(() => {
        stopPump();
        drawFrame();
        finalize();
      });

      await video.play();
      drawFrame();

      await playbackPromise;

      await recorderStopPromise;

      if (canceled) {
        return;
      }

      const blob = new Blob(chunks, { type: selectedMime });
      const url = URL.createObjectURL(blob);
      const extension = selectedMime.includes("mp4") ? "mp4" : "webm";
      const filename = `run_${runId ?? "unknown"}_traced.${extension}`;
      setDownloadUrl(url);
      setDownloadName(filename);
      setState("complete");
      setProgress(1);
    } catch (err) {
      console.error("Export failed", err);
      setError(err instanceof Error ? err.message : "Failed to export traced video");
      setState("error");
    }
  }, [includeMetrics, metrics, runId, state, trace, videoUrl]);

  const canStart = state === "idle" || state === "error" || state === "canceled" || state === "complete";

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Export traced video</h2>
            <p className="text-xs text-slate-400">Replay the run with tracer overlay and download a shareable clip.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Close
          </button>
        </header>

        <section className="space-y-4 text-sm text-slate-300">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
              <span>Resolution</span>
              <span className="text-slate-400">Match source</span>
            </div>
            <p className="text-xs text-slate-500">
              Video will export at the original resolution ({" "}
              <span className="font-mono text-slate-300">source</span> ).
            </p>
          </div>

          <label
            className={`flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300 ${
              metrics.length ? "" : "opacity-60"
            }`}
          >
            <input
              type="checkbox"
              checked={includeMetrics}
              onChange={(event) => setIncludeMetrics(event.target.checked)}
              disabled={!metrics.length}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400 focus:ring-emerald-500 disabled:cursor-not-allowed"
            />
            Include metrics overlay
            {!metrics.length && <span className="text-[0.65rem] uppercase tracking-wide text-slate-500">Not available</span>}
          </label>

          {error && <p className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">{error}</p>}

          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>{state === "recording" ? "Exporting…" : state === "complete" ? "Complete" : "Idle"}</span>
              {bytesRecorded > 0 && <span>{formatSize(bytesRecorded)}</span>}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={startExport}
              disabled={!canStart || !videoUrl}
            >
              {state === "recording" || state === "preparing" ? "Exporting…" : "Start Export"}
            </button>

            {(state === "recording" || state === "preparing") && (
              <button
                type="button"
                className="rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                onClick={() => abortRef.current()}
              >
                Cancel
              </button>
            )}

            {downloadUrl && state === "complete" && (
              <a
                href={downloadUrl}
                download={downloadName ?? undefined}
                className="ml-auto inline-flex items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20"
              >
                Download ({mimeType?.includes("mp4") ? "MP4" : "WebM"})
              </a>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}


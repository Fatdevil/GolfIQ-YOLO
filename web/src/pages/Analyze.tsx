import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { CheckCircle2, Upload, Video, XCircle } from "lucide-react";
import MetricCard from "../components/MetricCard";
import { postVideoAnalyze, postZipAnalyze } from "../api";
import TracerCanvas from "../components/TracerCanvas";
import GhostFrames from "../components/GhostFrames";
import LiveCards from "../components/LiveCards";
import { extractBackViewPayload } from "../lib/traceUtils";
import { visualTracerEnabled } from "../config";
import {
  buildCaptureMetadata,
  calculateLaplacianVariance,
  calculateMeanLuminance,
  estimateFpsFromSamples,
  verdictForBlur,
  verdictForBrightness,
  verdictForFps,
  type CaptureIssue,
  type CaptureMetadata,
} from "../lib/capturePreflight";

interface AnalyzeMetrics {
  ball_speed_mps?: number;
  ball_speed_mph?: number;
  club_speed_mps?: number;
  club_speed_mph?: number;
  launch_deg?: number;
  carry_m?: number;
  confidence?: number;
  metrics_version?: number;
  spin_rpm?: number | null;
  spin_axis_deg?: number | null;
  club_path_deg?: number | null;
  explain?: ExplainResult;
  [key: string]: unknown;
}

type ExplainIssue = {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  details?: Record<string, unknown>;
};

type ExplainResult = {
  confidence: number;
  issues: ExplainIssue[];
  summary: string;
};

interface AnalyzeEvent {
  id?: string;
  type?: string;
  ts?: number;
  [key: string]: unknown;
}

interface AnalyzeResult {
  run_id?: string;
  metrics?: AnalyzeMetrics;
  events?: AnalyzeEvent[];
  capture?: CaptureMetadata;
  [key: string]: unknown;
}

const metricConfig: {
  key: keyof AnalyzeMetrics;
  label: string;
  unit?: string;
  secondary?: (metrics: AnalyzeMetrics) => string | undefined;
}[] = [
  {
    key: "ball_speed_mps",
    label: "Ball Speed",
    unit: "m/s",
    secondary: (m) =>
      typeof m.ball_speed_mph === "number" ? `${m.ball_speed_mph.toFixed(2)} mph` : undefined,
  },
  { key: "club_speed_mps", label: "Club Speed", unit: "m/s" },
  { key: "launch_deg", label: "Launch Angle", unit: "°" },
  { key: "carry_m", label: "Carry", unit: "m" },
  {
    key: "confidence",
    label: "Confidence",
    secondary: (m) =>
      typeof m.confidence === "number" ? `${(m.confidence * 100).toFixed(1)}%` : undefined,
  },
];

function useFileInput() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reset = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };
  return { inputRef, reset };
}

export default function AnalyzePage() {
  const [activeTab, setActiveTab] = useState<"zip" | "video">("zip");
  const [zipLoading, setZipLoading] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [rangeModeEnabled, setRangeModeEnabled] = useState(false);
  const [preflightStatus, setPreflightStatus] = useState<
    "idle" | "running" | "ready" | "error"
  >("idle");
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [preflightIssues, setPreflightIssues] = useState<CaptureIssue[]>([]);
  const [preflightMeta, setPreflightMeta] = useState<CaptureMetadata | null>(null);
  const [preflightSummary, setPreflightSummary] = useState({
    fps: null as number | null,
    brightness: null as number | null,
    blur: null as number | null,
  });

  const { inputRef: zipRef, reset: resetZip } = useFileInput();
  const { inputRef: videoRef, reset: resetVideo } = useFileInput();

  const metrics = useMemo<AnalyzeMetrics>(() => result?.metrics ?? {}, [result]);
  const backView = useMemo(() => extractBackViewPayload(result), [result]);
  const qualityFlags = useMemo(() => backView?.quality ?? null, [backView]);
  const explain = useMemo<ExplainResult | null>(() => {
    const payload = metrics.explain;
    if (!payload || typeof payload !== "object") {
      return null;
    }
    return payload as ExplainResult;
  }, [metrics]);
  const explainIssues = useMemo<ExplainIssue[]>(() => {
    if (!explain?.issues) {
      return [];
    }
    const rank: Record<ExplainIssue["severity"], number> = {
      error: 0,
      warn: 1,
      info: 2,
    };
    return [...explain.issues].sort((a, b) => rank[a.severity] - rank[b.severity]);
  }, [explain]);

  const [zipForm, setZipForm] = useState({
    file: null as File | null,
    fps: 240,
    ref_len_m: 3,
    ref_len_px: 600,
    mode: "detector",
    smoothing_window: 3,
    persist: false,
  });

  const [videoForm, setVideoForm] = useState({
    file: null as File | null,
    fps_fallback: 240,
    ref_len_m: 3,
    ref_len_px: 600,
    smoothing_window: 3,
    persist: false,
    capture: null as CaptureMetadata | null,
  });

  const resetPreflight = () => {
    setPreflightStatus("idle");
    setPreflightError(null);
    setPreflightIssues([]);
    setPreflightMeta(null);
    setPreflightSummary({ fps: null, brightness: null, blur: null });
    setVideoForm((prev) => ({ ...prev, capture: null }));
  };

  const handleZipFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setZipForm((prev) => ({ ...prev, file: file ?? null }));
  };

  const handleVideoFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setVideoForm((prev) => ({ ...prev, file: file ?? null }));
    resetPreflight();
  };

  const handleZipSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!zipForm.file) {
      setError("Please select a ZIP file to analyze.");
      return;
    }
    setZipLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("frames_zip", zipForm.file);
      const data = await postZipAnalyze(form, {
        fps: zipForm.fps,
        ref_len_m: zipForm.ref_len_m,
        ref_len_px: zipForm.ref_len_px,
        mode: zipForm.mode,
        smoothing_window: zipForm.smoothing_window,
        persist: zipForm.persist,
      });
      setResult(data);
      resetZip();
      setZipForm((prev) => ({ ...prev, file: null }));
    } catch (err) {
      console.error(err);
      setError("Failed to analyze ZIP. Check API logs for details.");
    } finally {
      setZipLoading(false);
    }
  };

  const handleVideoSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!videoForm.file) {
      setError("Please select a video file to analyze.");
      return;
    }
    if (rangeModeEnabled && preflightMeta && !preflightMeta.okToRecordOrUpload) {
      setError("Range Mode checks must pass before uploading.");
      return;
    }
    setVideoLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("video", videoForm.file);
      if (videoForm.capture) {
        form.append("capture", JSON.stringify(videoForm.capture));
      }
      const data = await postVideoAnalyze(form, {
        fps_fallback: videoForm.fps_fallback,
        ref_len_m: videoForm.ref_len_m,
        ref_len_px: videoForm.ref_len_px,
        smoothing_window: videoForm.smoothing_window,
        persist: videoForm.persist,
      });
      setResult(data);
      resetVideo();
      setVideoForm((prev) => ({ ...prev, file: null }));
      resetPreflight();
    } catch (err) {
      console.error(err);
      setError("Failed to analyze video. Check API logs for details.");
    } finally {
      setVideoLoading(false);
    }
  };

  const runRangePreflight = async () => {
    if (!videoForm.file) {
      setError("Select a video file first to run Range Mode checks.");
      return;
    }
    setPreflightStatus("running");
    setPreflightError(null);
    setPreflightIssues([]);
    setPreflightSummary({ fps: null, brightness: null, blur: null });

    const file = videoForm.file;
    let objectUrl: string | null = null;
    try {
      const url = URL.createObjectURL(file);
      objectUrl = url;
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.preload = "metadata";
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Unable to read video metadata."));
      });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas is unavailable in this browser.");
      }
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      if (!width || !height) {
        throw new Error("Unable to read video dimensions.");
      }
      canvas.width = width;
      canvas.height = height;

      const frameTimes: number[] = [];
      const frameNumbers: number[] = [];
      const brightnessSamples: number[] = [];
      const blurSamples: number[] = [];

      const sampleCount = 6;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const stride = duration > 0 ? duration / (sampleCount + 1) : 0.1;
      for (let i = 1; i <= sampleCount; i += 1) {
        const targetTime = duration > 0 ? Math.min(duration * 0.98, i * stride) : i * 0.1;
        await new Promise<void>((resolve, reject) => {
          const onSeeked = () => resolve();
          const onError = () => reject(new Error("Unable to sample frames."));
          video.onseeked = onSeeked;
          video.onerror = onError;
          video.currentTime = targetTime;
        });
        ctx.drawImage(video, 0, 0, width, height);
        const frame = ctx.getImageData(0, 0, width, height);
        const brightness = calculateMeanLuminance(frame);
        const blur = calculateLaplacianVariance(frame);
        brightnessSamples.push(brightness);
        blurSamples.push(blur);
        frameTimes.push(video.currentTime);
        const frameNumber =
          typeof video.getVideoPlaybackQuality === "function"
            ? video.getVideoPlaybackQuality().totalVideoFrames
            : i * Math.round(videoForm.fps_fallback * stride);
        frameNumbers.push(frameNumber);
      }

      const brightnessMean =
        brightnessSamples.reduce((sum, value) => sum + value, 0) /
        (brightnessSamples.length || 1);
      const blurScore =
        blurSamples.reduce((sum, value) => sum + value, 0) /
        (blurSamples.length || 1);
      const fps = estimateFpsFromSamples({
        brightnessMean,
        blurScore,
        frameTimes,
        frameNumbers,
      });

      const metadata = buildCaptureMetadata({
        fps,
        brightnessMean,
        blurScore,
        framingTipsShown: true,
      });

      setPreflightStatus("ready");
      setPreflightMeta(metadata);
      setPreflightIssues(metadata.issues);
      setPreflightSummary({ fps, brightness: brightnessMean, blur: blurScore });
      setVideoForm((prev) => ({ ...prev, capture: metadata }));
    } catch (err) {
      console.error(err);
      setPreflightStatus("error");
      setPreflightError(
        err instanceof Error
          ? err.message
          : "Range Mode preflight checks failed. Try another file."
      );
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  };

  const renderMetrics = () => (
    <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {metricConfig.map((metric) => (
        <MetricCard
          key={metric.key}
          title={metric.label}
          value={metrics[metric.key] as number | string | undefined}
          unit={metric.unit}
          secondary={metric.secondary?.(metrics)}
        />
      ))}
      {metrics?.spin_rpm != null && (
        <MetricCard title="Spin (rpm)" value={metrics.spin_rpm} />
      )}
      {metrics?.spin_axis_deg != null && (
        <MetricCard title="Spin Axis (°)" value={metrics.spin_axis_deg} />
      )}
      {metrics?.club_path_deg != null && (
        <MetricCard title="Club Path (°)" value={metrics.club_path_deg} />
      )}
    </div>
  );

  const renderQualityBadges = () => {
    if (!qualityFlags || Object.keys(qualityFlags).length === 0) {
      return null;
    }
    return Object.entries(qualityFlags).map(([key, value]) => (
      <span
        key={key}
        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200"
      >
        <span className="uppercase tracking-wide text-[0.65rem] text-emerald-300/80">
          {key.replace(/[_-]/g, " ")}
        </span>
        {value && <span className="text-slate-200">{value}</span>}
      </span>
    ));
  };

  const qualityBadgeItems = renderQualityBadges();
  const topExplainIssues = explainIssues.slice(0, 3);
  const severityStyles: Record<ExplainIssue["severity"], string> = {
    error: "border-red-500/40 bg-red-500/10 text-red-200",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    info: "border-slate-500/40 bg-slate-500/10 text-slate-200",
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analyze</h1>
          <p className="text-sm text-slate-400">
            Upload capture ZIPs or MP4s to run full analysis with GolfIQ.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
              rangeModeEnabled
                ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                : "border-slate-700 bg-slate-900/60 text-slate-300 hover:text-emerald-200"
            }`}
            onClick={() => {
              setRangeModeEnabled((prev) => !prev);
              resetPreflight();
            }}
          >
            Range Mode
          </button>
          <div className="flex gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-1 text-sm">
            <button
              className={`flex items-center gap-2 rounded-md px-3 py-2 transition ${
                activeTab === "zip" ? "bg-emerald-500/10 text-emerald-200" : "text-slate-300 hover:text-emerald-200"
              }`}
              onClick={() => setActiveTab("zip")}
            >
              <Upload className="h-4 w-4" /> ZIP
            </button>
            <button
              className={`flex items-center gap-2 rounded-md px-3 py-2 transition ${
                activeTab === "video" ? "bg-emerald-500/10 text-emerald-200" : "text-slate-300 hover:text-emerald-200"
              }`}
              onClick={() => setActiveTab("video")}
            >
              <Video className="h-4 w-4" /> MP4
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {activeTab === "zip" ? (
        <form
          onSubmit={handleZipSubmit}
          className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg"
        >
          <div>
            <label className="text-sm font-medium text-slate-300">Capture ZIP</label>
            <input
              ref={zipRef}
              type="file"
              accept=".zip"
              onChange={handleZipFile}
              className="mt-2 block w-full rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col text-sm">
              FPS
              <input
                type="number"
                min={1}
                value={zipForm.fps}
                onChange={(e) => setZipForm((p) => ({ ...p, fps: Number(e.target.value) }))}
                className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
                required
              />
            </label>
            <label className="flex flex-col text-sm">
              Ref length (m)
              <input
                type="number"
                min={0}
                step="0.01"
                value={zipForm.ref_len_m}
                onChange={(e) => setZipForm((p) => ({ ...p, ref_len_m: Number(e.target.value) }))}
                className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
                required
              />
            </label>
            <label className="flex flex-col text-sm">
              Ref length (px)
              <input
                type="number"
                min={0}
                value={zipForm.ref_len_px}
                onChange={(e) => setZipForm((p) => ({ ...p, ref_len_px: Number(e.target.value) }))}
                className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
                required
              />
            </label>
            <label className="flex flex-col text-sm">
              Mode
              <select
                value={zipForm.mode}
                onChange={(e) => setZipForm((p) => ({ ...p, mode: e.target.value }))}
                className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
              >
                <option value="detector">Detector</option>
                <option value="tracker">Tracker</option>
              </select>
            </label>
            <label className="flex flex-col text-sm">
              Smoothing window
              <input
                type="number"
                min={1}
                value={zipForm.smoothing_window}
                onChange={(e) => setZipForm((p) => ({ ...p, smoothing_window: Number(e.target.value) }))}
                className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={zipForm.persist}
                onChange={(e) => setZipForm((p) => ({ ...p, persist: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-700 bg-slate-950"
              />
              Persist run
            </label>
          </div>
          <button
            type="submit"
            disabled={zipLoading}
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
          >
            {zipLoading ? "Analyzing…" : "Run ZIP analyze"}
          </button>
        </form>
      ) : (
        <form
          onSubmit={handleVideoSubmit}
          className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg"
        >
          {rangeModeEnabled && (
            <div className="space-y-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                  Range Mode · Capture Quality
                </p>
                <h2 className="text-lg font-semibold text-slate-100">3-step setup</h2>
                <p className="text-sm text-slate-300">
                  Follow the checklist, run preflight checks, then upload when everything looks good.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                    Step 1 · Setup tips
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-200">
                    <li>Use a tripod or steady mount.</li>
                    <li>Keep ball flight in frame (start to landing).</li>
                    <li>Lock focus/exposure and avoid zooming.</li>
                  </ul>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                    Step 2 · Preflight checks
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-slate-200">
                    <p>FPS stability, exposure, and blur are sampled automatically.</p>
                    <button
                      type="button"
                      onClick={runRangePreflight}
                      disabled={preflightStatus === "running"}
                      className="mt-2 inline-flex items-center justify-center rounded-md border border-emerald-500/60 bg-emerald-500/20 px-3 py-2 text-xs font-semibold uppercase text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed"
                    >
                      {preflightStatus === "running" ? "Running checks…" : "Run preflight"}
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                    Step 3 · OK to upload
                  </p>
                  <p className="mt-3 text-sm text-slate-200">
                    Upload is enabled once critical issues are resolved.
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    {preflightMeta?.okToRecordOrUpload ? (
                      <span className="inline-flex items-center gap-2 text-emerald-200">
                        <CheckCircle2 className="h-4 w-4" /> OK to upload
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-amber-200">
                        <XCircle className="h-4 w-4" /> Fix issues first
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400">FPS</p>
                  <p className="mt-1 text-base font-semibold text-slate-100">
                    {preflightSummary.fps ? `${preflightSummary.fps.toFixed(1)} fps` : "—"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {preflightSummary.fps == null
                      ? "Estimate unavailable"
                      : verdictForFps(preflightSummary.fps).toUpperCase()}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Brightness</p>
                  <p className="mt-1 text-base font-semibold text-slate-100">
                    {preflightSummary.brightness != null
                      ? preflightSummary.brightness.toFixed(1)
                      : "—"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {preflightSummary.brightness == null
                      ? "Not sampled"
                      : verdictForBrightness(preflightSummary.brightness).toUpperCase()}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Blur</p>
                  <p className="mt-1 text-base font-semibold text-slate-100">
                    {preflightSummary.blur != null
                      ? preflightSummary.blur.toFixed(1)
                      : "—"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {preflightSummary.blur == null
                      ? "Not sampled"
                      : verdictForBlur(preflightSummary.blur).toUpperCase()}
                  </p>
                </div>
              </div>
              {preflightError && (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {preflightError}
                </div>
              )}
              {preflightIssues.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                    Issues & tips
                  </p>
                  <ul className="space-y-2 text-sm">
                    {preflightIssues.map((issue) => (
                      <li
                        key={issue.code}
                        className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-slate-200"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>{issue.message}</span>
                          <span className="text-xs uppercase tracking-wide text-slate-400">
                            {issue.severity}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-slate-300">Video file</label>
            <input
              ref={videoRef}
              type="file"
              accept="video/mp4"
              onChange={handleVideoFile}
              className="mt-2 block w-full rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col text-sm">
              FPS fallback
              <input
                type="number"
                min={1}
                value={videoForm.fps_fallback}
                onChange={(e) => setVideoForm((p) => ({ ...p, fps_fallback: Number(e.target.value) }))}
                className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
                required
              />
            </label>
            <label className="flex flex-col text-sm">
              Ref length (m)
              <input
                type="number"
                min={0}
                step="0.01"
                value={videoForm.ref_len_m}
                onChange={(e) => setVideoForm((p) => ({ ...p, ref_len_m: Number(e.target.value) }))}
                className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
                required
              />
            </label>
            <label className="flex flex-col text-sm">
              Ref length (px)
              <input
                type="number"
                min={0}
                value={videoForm.ref_len_px}
                onChange={(e) => setVideoForm((p) => ({ ...p, ref_len_px: Number(e.target.value) }))}
                className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
                required
              />
            </label>
            <label className="flex flex-col text-sm">
              Smoothing window
              <input
                type="number"
                min={1}
                value={videoForm.smoothing_window}
                onChange={(e) => setVideoForm((p) => ({ ...p, smoothing_window: Number(e.target.value) }))}
                className="mt-1 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={videoForm.persist}
                onChange={(e) => setVideoForm((p) => ({ ...p, persist: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-700 bg-slate-950"
              />
              Persist run
            </label>
          </div>
          <button
            type="submit"
            disabled={videoLoading}
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
          >
            {videoLoading ? "Analyzing…" : "Run video analyze"}
          </button>
        </form>
      )}

      {result && (
        <div className="space-y-6">
          {visualTracerEnabled && backView && (
            <div className="space-y-4">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 shadow-inner">
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
                {backView.trace && (
                  <TracerCanvas trace={backView.trace} className="absolute inset-0" />
                )}
                {backView.ghostFrames && backView.ghostFrames.length > 0 && (
                  <GhostFrames
                    frames={backView.ghostFrames}
                    trace={backView.trace}
                    className="absolute inset-0"
                  />
                )}
              </div>
              {((qualityBadgeItems && qualityBadgeItems.length > 0) || backView.source) && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                  {qualityBadgeItems && qualityBadgeItems.length > 0 && (
                    <div className="flex flex-wrap gap-2">{qualityBadgeItems}</div>
                  )}
                  {backView.source && (
                    <span className="text-xs text-slate-400">
                      Source: <span className="font-mono text-slate-200">{backView.source}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <h2 className="text-lg font-semibold text-emerald-200">Result</h2>
            {result.run_id && (
              <p className="mt-2 text-sm text-slate-400">
                Run ID: <span className="font-mono text-emerald-300">{result.run_id}</span>
              </p>
            )}
            {renderMetrics()}
          </div>
          {explain && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-emerald-200">Explain Result</h3>
                  <p className="mt-1 text-sm text-slate-400">{explain.summary}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Confidence</p>
                  <p className="text-xl font-semibold text-emerald-100">
                    {`${Math.round((explain.confidence ?? 0) * 100)}%`}
                  </p>
                </div>
              </div>
              {topExplainIssues.length > 0 ? (
                <ul className="mt-4 space-y-2 text-sm text-slate-200">
                  {topExplainIssues.map((issue) => (
                    <li
                      key={issue.code}
                      className={`rounded border px-3 py-2 ${severityStyles[issue.severity]}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{issue.message}</span>
                        <span className="text-xs uppercase tracking-wide">{issue.severity}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-slate-300">No explainability issues were detected.</p>
              )}
              <details className="mt-4 text-sm text-slate-300">
                <summary className="cursor-pointer select-none text-emerald-200">
                  View diagnostics
                </summary>
                <div className="mt-3 space-y-2">
                  {explainIssues.map((issue) => (
                    <div key={issue.code} className="rounded border border-slate-800 bg-slate-950/60 p-3">
                      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-wide text-slate-400">
                        <span>{issue.code}</span>
                        <span>{issue.severity}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-200">{issue.message}</p>
                      {issue.details && (
                        <pre className="mt-2 overflow-x-auto rounded bg-slate-950/80 p-2 text-[0.7rem] text-slate-400">
                          {JSON.stringify(issue.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
          {visualTracerEnabled && <LiveCards />}
          {result.events && result.events.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h3 className="text-base font-semibold text-emerald-200">Events</h3>
              <ul className="mt-4 space-y-2 text-sm text-slate-300">
                {result.events.map((event, index) => (
                  <li
                    key={event.id ?? index}
                    className="rounded border border-slate-800 bg-slate-900/80 px-3 py-2 font-mono text-xs"
                  >
                    {JSON.stringify(event)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.capture && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h3 className="text-base font-semibold text-emerald-200">Capture diagnostics</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400">FPS</p>
                  <p className="mt-1 text-base font-semibold text-slate-100">
                    {result.capture.fps ? `${result.capture.fps.toFixed(1)} fps` : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Brightness</p>
                  <p className="mt-1 text-base font-semibold text-slate-100">
                    {result.capture.brightness.mean.toFixed(1)} ({result.capture.brightness.verdict})
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Blur</p>
                  <p className="mt-1 text-base font-semibold text-slate-100">
                    {result.capture.blur.score.toFixed(1)} ({result.capture.blur.verdict})
                  </p>
                </div>
              </div>
              {result.capture.issues.length > 0 ? (
                <ul className="mt-4 space-y-2 text-sm text-slate-200">
                  {result.capture.issues.map((issue) => (
                    <li
                      key={issue.code}
                      className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{issue.message}</span>
                        <span className="text-xs uppercase tracking-wide text-slate-400">
                          {issue.severity}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-slate-300">No capture issues reported.</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

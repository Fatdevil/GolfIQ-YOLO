import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { Upload, Video } from "lucide-react";
import MetricCard from "../components/MetricCard";
import { postVideoAnalyze, postZipAnalyze } from "../api";

interface AnalyzeMetrics {
  ball_speed_mps?: number;
  ball_speed_mph?: number;
  club_speed_mps?: number;
  launch_deg?: number;
  carry_m?: number;
  confidence?: number;
  [key: string]: unknown;
}

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

  const { inputRef: zipRef, reset: resetZip } = useFileInput();
  const { inputRef: videoRef, reset: resetVideo } = useFileInput();

  const metrics = useMemo(() => result?.metrics ?? {}, [result]);

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
  });

  const handleZipFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setZipForm((prev) => ({ ...prev, file: file ?? null }));
  };

  const handleVideoFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setVideoForm((prev) => ({ ...prev, file: file ?? null }));
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
    setVideoLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("video", videoForm.file);
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
    } catch (err) {
      console.error(err);
      setError("Failed to analyze video. Check API logs for details.");
    } finally {
      setVideoLoading(false);
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
    </div>
  );

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analyze</h1>
          <p className="text-sm text-slate-400">
            Upload capture ZIPs or MP4s to run full analysis with GolfIQ.
          </p>
        </div>
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
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <h2 className="text-lg font-semibold text-emerald-200">Result</h2>
            {result.run_id && (
              <p className="mt-2 text-sm text-slate-400">
                Run ID: <span className="font-mono text-emerald-300">{result.run_id}</span>
              </p>
            )}
            {renderMetrics()}
          </div>
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
        </div>
      )}
    </section>
  );
}

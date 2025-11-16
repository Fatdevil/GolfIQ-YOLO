import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import {
  CalibrationMeasureResponse,
  postCalibrationMeasure,
} from "../api";
import { CalibrationSnapshot, useCalibration } from "../hooks/useCalibration";
import { useCalibrationStatus } from "@/features/range/useCalibrationStatus";

type Point = { x: number; y: number };
type Quality = CalibrationMeasureResponse["quality"];

type ReferenceOption = {
  id: string;
  label: string;
  value: number | null;
};

const referenceOptions: ReferenceOption[] = [
  { id: "a4_short", label: "A4 short edge (0.210 m)", value: 0.21 },
  { id: "a4_long", label: "A4 long edge (0.297 m)", value: 0.297 },
  { id: "driver", label: "Driver length (1.12 m)", value: 1.12 },
  { id: "custom", label: "Custom", value: null },
];

const qualityCopy: Record<Quality, { badge: string; tone: "ok" | "warn" } & {
  description: string;
}> = {
  ok: {
    badge: "OK",
    tone: "ok",
    description: "Calibration looks solid. You are ready to capture swings.",
  },
  ok_warn: {
    badge: "OK (check fps)",
    tone: "warn",
    description: "Try to push the capture FPS above 120 for extra precision.",
  },
  low_fps: {
    badge: "Needs work",
    tone: "warn",
    description: "FPS is below the recommended 80. Increase frame rate before recording.",
  },
  blurry: {
    badge: "Needs work",
    tone: "warn",
    description:
      "The still looks blurry. Increase shutter speed or add more light to freeze motion.",
  },
};

const estimateBlur = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "sharp" as const;
  }
  const { width, height } = canvas;
  if (!width || !height) {
    return "sharp" as const;
  }
  const step = Math.max(1, Math.floor(Math.min(width, height) / 200));
  const { data } = ctx.getImageData(0, 0, width, height);
  let total = 0;
  let count = 0;
  for (let y = step; y < height; y += step) {
    for (let x = step; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const lum = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
      const prevX = (y * width + (x - step)) * 4;
      const prevY = ((y - step) * width + x) * 4;
      const lumX =
        data[prevX] * 0.299 + data[prevX + 1] * 0.587 + data[prevX + 2] * 0.114;
      const lumY =
        data[prevY] * 0.299 + data[prevY + 1] * 0.587 + data[prevY + 2] * 0.114;
      total += Math.abs(lum - lumX) + Math.abs(lum - lumY);
      count += 2;
    }
  }
  const score = count > 0 ? total / count : 0;
  return score < 8 ? ("blurry" as const) : ("sharp" as const);
};

const getReferenceLabel = (id: string) =>
  referenceOptions.find((option) => option.id === id)?.label || "Custom";

const formatMeters = (value: number) => `${value.toFixed(4)} m/px`;
const formatPixels = (value: number) => `${value.toFixed(1)} px`;

export default function CalibrationPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [reference, setReference] = useState<string>("a4_short");
  const [customMeters, setCustomMeters] = useState<number>(1);
  const [fps, setFps] = useState<number>(120);
  const [result, setResult] = useState<CalibrationMeasureResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { calibration, saveCalibration } = useCalibration();
  const { markCalibrated } = useCalibrationStatus();

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    if (!image) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    canvas.width = image.width;
    canvas.height = image.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    context.lineWidth = 3;
    context.strokeStyle = "#10b981";
    context.fillStyle = "#10b981";
    points.forEach((point) => {
      context.beginPath();
      context.arc(point.x, point.y, 6, 0, Math.PI * 2);
      context.fill();
    });
    if (points.length === 2) {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      context.lineTo(points[1].x, points[1].y);
      context.stroke();
    }
  }, [image, points]);

  useEffect(() => {
    draw();
  }, [draw]);

  const pxDistance = useMemo(() => {
    if (points.length !== 2) {
      return null;
    }
    const [a, b] = points;
    return Math.hypot(b.x - a.x, b.y - a.y);
  }, [points]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setPoints([]);
    setResult(null);
    setError(null);
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    const img = new Image();
    img.onload = () => {
      setImage(img);
    };
    img.src = url;
  };

  const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !image) {
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    setPoints((prev) => {
      if (prev.length >= 2) {
        return [{ x, y }];
      }
      return [...prev, { x, y }];
    });
    setResult(null);
  };

  const currentReferenceMeters = useMemo(() => {
    const selected = referenceOptions.find((option) => option.id === reference);
    if (!selected) {
      return customMeters;
    }
    return selected.value ?? customMeters;
  }, [reference, customMeters]);

  const computeBlurQuality = useCallback(() => {
    if (!canvasRef.current) {
      return "sharp" as const;
    }
    return estimateBlur(canvasRef.current);
  }, []);

  const handleCompute = async () => {
    setError(null);
    if (!image) {
      setError("Upload a still image before measuring.");
      return;
    }
    if (points.length !== 2 || !pxDistance) {
      setError("Click two points that correspond to the known distance.");
      return;
    }
    if (!currentReferenceMeters || currentReferenceMeters <= 0) {
      setError("Reference distance must be greater than zero.");
      return;
    }
    setLoading(true);
    try {
      const payload = await postCalibrationMeasure({
        p1x: points[0].x,
        p1y: points[0].y,
        p2x: points[1].x,
        p2y: points[1].y,
        ref_len_m: currentReferenceMeters,
        fps,
      });
      let finalQuality: Quality = payload.quality;
      if (computeBlurQuality() === "blurry") {
        finalQuality = "blurry";
      }
      const enriched: CalibrationMeasureResponse = {
        ...payload,
        quality: finalQuality,
      };
      setResult(enriched);
    } catch (err) {
      setError("Failed to measure calibration. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUseInSession = () => {
    if (!result) {
      return;
    }
    const snapshot: CalibrationSnapshot = {
      metersPerPixel: result.meters_per_pixel,
      fps: result.fps,
      quality: result.quality,
      referenceLabel: getReferenceLabel(reference),
      updatedAt: new Date().toISOString(),
      points,
    };
    saveCalibration(snapshot);
    markCalibrated();
  };

  const qualityInfo = result ? qualityCopy[result.quality] : null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-emerald-300">Calibration wizard</h1>
        <p className="text-sm text-slate-300">
          Capture a still frame from your recording setup, pick a known distance, and
          click the two matching points to estimate meters-per-pixel.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-200">
              Still image
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleFileChange}
              className="mt-2 block w-full cursor-pointer rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200"
            />
            <p className="mt-1 text-xs text-slate-400">
              Tip: pull a frame from your video capture with the ball and reference object in
              view.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200">
              Click two matching points
            </label>
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
              <canvas
                ref={canvasRef}
                className="block h-auto w-full cursor-crosshair"
                onClick={handleCanvasClick}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span>{points.length === 0 && "No points selected."}</span>
              {points.length > 0 && (
                <span>
                  P1: ({points[0].x.toFixed(1)}, {points[0].y.toFixed(1)})
                </span>
              )}
              {points.length > 1 && (
                <span>
                  P2: ({points[1].x.toFixed(1)}, {points[1].y.toFixed(1)})
                </span>
              )}
              {pxDistance && <span>Distance: {formatPixels(pxDistance)}</span>}
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-5">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">Reference</label>
            <select
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            >
              {referenceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {reference === "custom" && (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-400">
                  Custom length (meters)
                </label>
                <input
                  type="number"
                  value={customMeters}
                  min={0}
                  step="0.01"
                  onChange={(event) => setCustomMeters(Number(event.target.value))}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">Capture FPS</label>
            <input
              type="number"
              value={fps}
              min={1}
              step="1"
              onChange={(event) => setFps(Number(event.target.value))}
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-400">
              For high-speed launch monitors aim for 120–240 fps. Below 80 fps produces
              noisy club speed estimates.
            </p>
          </div>

          <button
            onClick={handleCompute}
            disabled={loading}
            className="w-full rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Computing..." : "Compute"}
          </button>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          {result && qualityInfo && (
            <div className="space-y-3 rounded border border-slate-700 bg-slate-950/60 p-4 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Calibration
                  </p>
                  <p className="text-lg font-semibold text-emerald-200">
                    {formatMeters(result.meters_per_pixel)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    qualityInfo.tone === "ok"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {qualityInfo.badge}
                </span>
              </div>
              <p className="text-xs text-slate-400">{qualityInfo.description}</p>
              <div className="rounded bg-slate-900/60 p-3 text-xs text-slate-400">
                <p>FPS used: {result.fps.toFixed(1)}</p>
                <p>Reference: {getReferenceLabel(reference)}</p>
              </div>
              <button
                onClick={handleUseInSession}
                className="w-full rounded bg-emerald-500/80 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400"
              >
                Use in session
              </button>
            </div>
          )}

          {calibration && !result && (
            <div className="rounded border border-emerald-700/40 bg-emerald-500/10 p-4 text-xs text-emerald-200">
              <p className="font-semibold">Current session calibration</p>
              <p>{formatMeters(calibration.metersPerPixel)}</p>
              <p>Reference: {calibration.referenceLabel || "Custom"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

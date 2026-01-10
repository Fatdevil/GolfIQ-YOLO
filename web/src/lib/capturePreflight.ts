export type CaptureVerdict = "ok" | "warn" | "bad";

export type CaptureIssue = {
  code: string;
  severity: CaptureVerdict;
  message: string;
  details?: Record<string, unknown>;
};

export type CaptureMetricVerdict = {
  mean?: number;
  score?: number;
  verdict: CaptureVerdict;
};

export type CaptureFpsEstimate = {
  value?: number;
  method: "rvfc" | "seeked" | "metadata" | "fallback";
  confidence: "high" | "medium" | "low";
};

export type CaptureMetadata = {
  mode: "range";
  fps: number | null;
  fpsEstimate?: CaptureFpsEstimate;
  brightness: CaptureMetricVerdict & { mean: number };
  blur: CaptureMetricVerdict & { score: number };
  framingTipsShown: boolean;
  issues: CaptureIssue[];
  okToRecordOrUpload: boolean;
};

export const CAPTURE_PREFLIGHT_THRESHOLDS = {
  fps: {
    min: 30,
    preferred: 60,
  },
  brightness: {
    tooDark: 40,
    warnDark: 60,
    warnBright: 200,
    tooBright: 215,
  },
  blur: {
    bad: 80,
    warn: 130,
  },
};

export function calculateMeanLuminance(imageData: ImageData): number {
  const { data } = imageData;
  let total = 0;
  const count = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    total += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return count ? total / count : 0;
}

export function calculateLaplacianVariance(imageData: ImageData): number {
  const { data, width, height } = imageData;
  const size = width * height;
  if (size === 0) {
    return 0;
  }
  const grayscale = new Float32Array(size);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    grayscale[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  const laplacian = new Float32Array(size);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const top = grayscale[idx - width];
      const bottom = grayscale[idx + width];
      const left = grayscale[idx - 1];
      const right = grayscale[idx + 1];
      const center = grayscale[idx];
      laplacian[idx] = top + bottom + left + right - 4 * center;
    }
  }
  let mean = 0;
  for (let i = 0; i < laplacian.length; i += 1) {
    mean += laplacian[i];
  }
  mean /= laplacian.length;
  let variance = 0;
  for (let i = 0; i < laplacian.length; i += 1) {
    const diff = laplacian[i] - mean;
    variance += diff * diff;
  }
  return variance / laplacian.length;
}

export function verdictForFpsEstimate(estimate?: CaptureFpsEstimate): CaptureVerdict {
  const fps = estimate?.value;
  if (!fps || Number.isNaN(fps)) {
    return "warn";
  }
  if (estimate?.confidence === "low") {
    return "warn";
  }
  if (fps < CAPTURE_PREFLIGHT_THRESHOLDS.fps.min) {
    return "bad";
  }
  if (fps < CAPTURE_PREFLIGHT_THRESHOLDS.fps.preferred) {
    return "warn";
  }
  return "ok";
}

export function verdictForBrightness(mean: number): CaptureVerdict {
  const { tooDark, warnDark, warnBright, tooBright } =
    CAPTURE_PREFLIGHT_THRESHOLDS.brightness;
  if (mean <= tooDark || mean >= tooBright) {
    return "bad";
  }
  if (mean <= warnDark || mean >= warnBright) {
    return "warn";
  }
  return "ok";
}

export function verdictForBlur(score: number): CaptureVerdict {
  const { bad, warn } = CAPTURE_PREFLIGHT_THRESHOLDS.blur;
  if (score < bad) {
    return "bad";
  }
  if (score < warn) {
    return "warn";
  }
  return "ok";
}

export function buildCaptureMetadata(options: {
  fpsEstimate?: CaptureFpsEstimate;
  brightnessMean: number;
  blurScore: number;
  framingTipsShown: boolean;
}): CaptureMetadata {
  const fpsVerdict = verdictForFpsEstimate(options.fpsEstimate);
  const brightnessVerdict = verdictForBrightness(options.brightnessMean);
  const blurVerdict = verdictForBlur(options.blurScore);
  const issues: CaptureIssue[] = [];
  const fpsValue = options.fpsEstimate?.value;

  if (fpsVerdict !== "ok") {
    issues.push({
      code: fpsValue ? "fps_low" : "fps_unavailable",
      severity: fpsVerdict === "bad" ? "bad" : "warn",
      message:
        fpsValue == null || options.fpsEstimate?.confidence === "low"
          ? "Couldn't reliably estimate FPS; verify your camera is set to 60+ FPS."
          : `FPS is ${Math.round(fpsValue)} — aim for 60+ FPS (30 minimum).`,
      details:
        fpsValue == null
          ? { estimate: options.fpsEstimate }
          : { fps: fpsValue, estimate: options.fpsEstimate },
    });
  }

  if (brightnessVerdict !== "ok") {
    issues.push({
      code: "exposure",
      severity: brightnessVerdict,
      message:
        brightnessVerdict === "bad"
          ? "Exposure is too extreme — adjust lighting or exposure lock."
          : "Exposure looks off — add light or reduce highlights.",
      details: { mean: options.brightnessMean },
    });
  }

  if (blurVerdict !== "ok") {
    issues.push({
      code: "blur",
      severity: blurVerdict,
      message:
        blurVerdict === "bad"
          ? "Video is too blurry — stabilize the camera and avoid motion blur."
          : "Slight blur detected — tighten focus and stabilize the camera.",
      details: { score: options.blurScore },
    });
  }

  const okToRecordOrUpload = !issues.some((issue) => issue.severity === "bad");

  return {
    mode: "range",
    fps: fpsValue ?? null,
    fpsEstimate: options.fpsEstimate,
    brightness: {
      mean: options.brightnessMean,
      verdict: brightnessVerdict,
    },
    blur: {
      score: options.blurScore,
      verdict: blurVerdict,
    },
    framingTipsShown: options.framingTipsShown,
    issues,
    okToRecordOrUpload,
  };
}

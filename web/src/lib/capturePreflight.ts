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

export type CaptureMetadata = {
  mode: "range";
  fps: number | null;
  brightness: CaptureMetricVerdict & { mean: number };
  blur: CaptureMetricVerdict & { score: number };
  framingTipsShown: boolean;
  issues: CaptureIssue[];
  okToRecordOrUpload: boolean;
};

export type CapturePreflightSample = {
  brightnessMean: number;
  blurScore: number;
  frameTimes: number[];
  frameNumbers: number[];
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

export function verdictForFps(fps: number | null): CaptureVerdict {
  if (!fps || Number.isNaN(fps)) {
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

export function estimateFpsFromSamples(sample: CapturePreflightSample): number | null {
  const { frameTimes, frameNumbers } = sample;
  if (frameTimes.length < 2 || frameNumbers.length < 2) {
    return null;
  }
  const startIdx = frameNumbers.findIndex((value) => value >= 0);
  if (startIdx === -1) {
    return null;
  }
  const endIdx = frameNumbers.length - 1;
  const startFrame = frameNumbers[startIdx];
  const endFrame = frameNumbers[endIdx];
  const startTime = frameTimes[startIdx];
  const endTime = frameTimes[endIdx];
  const frameDelta = endFrame - startFrame;
  const timeDelta = endTime - startTime;
  if (frameDelta <= 0 || timeDelta <= 0) {
    return null;
  }
  return frameDelta / timeDelta;
}

export function buildCaptureMetadata(options: {
  fps: number | null;
  brightnessMean: number;
  blurScore: number;
  framingTipsShown: boolean;
}): CaptureMetadata {
  const fpsVerdict = verdictForFps(options.fps);
  const brightnessVerdict = verdictForBrightness(options.brightnessMean);
  const blurVerdict = verdictForBlur(options.blurScore);
  const issues: CaptureIssue[] = [];

  if (fpsVerdict !== "ok") {
    issues.push({
      code: options.fps ? "fps_low" : "fps_unavailable",
      severity: fpsVerdict,
      message:
        options.fps == null
          ? "Unable to estimate FPS; verify your camera is set to 60+ FPS."
          : `FPS is ${Math.round(options.fps)} — aim for 60+ FPS (30 minimum).`,
      details: options.fps == null ? undefined : { fps: options.fps },
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
    fps: options.fps,
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

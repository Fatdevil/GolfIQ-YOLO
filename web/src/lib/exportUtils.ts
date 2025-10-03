import { TraceData, createSmoothPath, mapPointToCanvas, getBounds } from "./traceUtils";

type RecorderPreference = {
  preferMp4?: boolean;
  videoBitsPerSecond?: number;
};

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
];

export const pickSupportedMimeType = (preferMp4 = false): string | null => {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return null;
  }

  const ordered = preferMp4
    ? [...MIME_CANDIDATES.filter((type) => type.includes("mp4")), ...MIME_CANDIDATES.filter((type) => !type.includes("mp4"))]
    : MIME_CANDIDATES;

  for (const type of ordered) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return null;
};

export const setupRecorder = (
  canvas: HTMLCanvasElement,
  preference: RecorderPreference = {}
): { recorder: MediaRecorder; mimeType: string } => {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder API is not supported in this browser");
  }

  const stream = canvas.captureStream();
  const mimeType = pickSupportedMimeType(preference.preferMp4) ?? "video/webm";
  const options: MediaRecorderOptions = { mimeType };
  if (preference.videoBitsPerSecond) {
    options.videoBitsPerSecond = preference.videoBitsPerSecond;
  }
  const recorder = new MediaRecorder(stream, options);
  return { recorder, mimeType };
};

export const waitForVideoMetadata = (video: HTMLVideoElement): Promise<void> =>
  new Promise((resolve, reject) => {
    if (video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0) {
      resolve();
      return;
    }
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = (event: Event) => {
      cleanup();
      reject(event instanceof ErrorEvent ? event.error : new Error("Failed to load video metadata"));
    };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
  });

export const waitForPlaybackEnd = (video: HTMLVideoElement): Promise<void> =>
  new Promise((resolve) => {
    if (video.ended) {
      resolve();
      return;
    }
    const onEnded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("ended", onEnded, { once: true });
    video.addEventListener("error", onError, { once: true });
  });

type FrameCallback = (metadata?: VideoFrameCallbackMetadata) => void;

export const startFramePump = (video: HTMLVideoElement, callback: FrameCallback): (() => void) => {
  let stopped = false;

  const draw = () => {
    if (stopped) return;
    callback();
  };

  const typedVideo = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: VideoFrameRequestCallback) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  };

  if (typeof typedVideo.requestVideoFrameCallback === "function" && typeof typedVideo.cancelVideoFrameCallback === "function") {
    let handle: number;
    const step = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (stopped) return;
      callback(metadata);
      handle = typedVideo.requestVideoFrameCallback!(step);
    };
    handle = typedVideo.requestVideoFrameCallback(step);
    return () => {
      stopped = true;
      if (handle) {
        typedVideo.cancelVideoFrameCallback!(handle);
      }
    };
  }

  let rafId = 0;
  const pump = () => {
    if (stopped) return;
    draw();
    if (!video.ended && !video.paused) {
      rafId = window.requestAnimationFrame(pump);
    }
  };

  const onPlay = () => {
    if (stopped) return;
    rafId = window.requestAnimationFrame(pump);
  };

  video.addEventListener("play", onPlay);
  if (!video.paused) {
    onPlay();
  }

  const onEnded = () => {
    draw();
  };

  video.addEventListener("ended", onEnded, { once: true });

  return () => {
    stopped = true;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }
    video.removeEventListener("play", onPlay);
    video.removeEventListener("ended", onEnded);
  };
};

export type MetricOverlay = {
  label: string;
  value: string;
  secondary?: string;
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

export const drawTraceOverlay = (
  ctx: CanvasRenderingContext2D,
  trace: TraceData,
  canvasWidth: number,
  canvasHeight: number
) => {
  const { mapped, normalized } = createSmoothPath(
    trace.points ?? [],
    canvasWidth,
    canvasHeight,
    0.2,
    undefined,
    trace.normalized
  );

  if (!mapped.length) {
    return;
  }

  ctx.save();
  const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  gradient.addColorStop(0, "#6ee7b7");
  gradient.addColorStop(0.5, "#34d399");
  gradient.addColorStop(1, "#10b981");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = Math.max(canvasWidth, canvasHeight) / 320;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  mapped.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();

  const bounds = trace.normalized ? { minX: 0, maxX: 1, minY: 0, maxY: 1 } : getBounds(trace.points ?? []);

  const markPoint = (index: number | undefined, color: string, label: string) => {
    if (index === undefined || !trace.points?.[index]) return;
    const mappedPoint = mapPointToCanvas(trace.points[index], canvasWidth, canvasHeight, bounds, normalized);
    ctx.fillStyle = color;
    const radius = Math.max(canvasWidth, canvasHeight) / 90;
    ctx.beginPath();
    ctx.arc(mappedPoint.x, mappedPoint.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = `${Math.max(canvasHeight / 45, 10)}px "Inter", "system-ui"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, mappedPoint.x, mappedPoint.y - radius * 1.2);
  };

  markPoint(trace.apexIndex, "#facc15", "Apex");
  markPoint(trace.landingIndex, "#f97316", "Landing");

  ctx.restore();
};

export const drawMetricsOverlay = (
  ctx: CanvasRenderingContext2D,
  metrics: MetricOverlay[],
  canvasWidth: number
) => {
  if (!metrics.length) return;

  const padding = canvasWidth * 0.015;
  const cardHeight = canvasWidth * 0.07;
  const cardWidth = canvasWidth * 0.22;
  const gap = padding * 0.6;
  const rows = Math.ceil(metrics.length / 2);
  const totalHeight = rows * cardHeight + (rows - 1) * gap + padding * 2;
  const totalWidth = cardWidth * 2 + gap + padding * 2;

  const originX = padding;
  const originY = padding;

  ctx.save();
  ctx.globalAlpha = 0.85;
  drawRoundedRect(ctx, originX - padding * 0.6, originY - padding * 0.6, totalWidth, totalHeight, padding);
  ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.font = `${Math.max(cardHeight * 0.18, 14)}px "Inter", "system-ui"`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  metrics.forEach((metric, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const x = originX + col * (cardWidth + gap);
    const y = originY + row * (cardHeight + gap);

    drawRoundedRect(ctx, x, y, cardWidth, cardHeight, padding * 0.5);
    ctx.fillStyle = "rgba(30, 41, 59, 0.85)";
    ctx.fill();

    ctx.fillStyle = "#bae6fd";
    ctx.font = `${Math.max(cardHeight * 0.22, 14)}px "Inter", "system-ui"`;
    ctx.fillText(metric.label, x + padding * 0.6, y + padding * 0.5);

    ctx.fillStyle = "#f8fafc";
    ctx.font = `${Math.max(cardHeight * 0.32, 18)}px "Inter", "system-ui"`;
    ctx.fillText(metric.value, x + padding * 0.6, y + padding * 1.4);

    if (metric.secondary) {
      ctx.fillStyle = "#cbd5f5";
      ctx.font = `${Math.max(cardHeight * 0.2, 12)}px "Inter", "system-ui"`;
      ctx.fillText(metric.secondary, x + padding * 0.6, y + cardHeight - padding * 1.2);
    }
  });

  ctx.restore();
};


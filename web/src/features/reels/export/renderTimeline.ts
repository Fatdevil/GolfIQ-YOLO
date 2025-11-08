import type { DrawCmd, ReelExportPreset } from '@shared/reels/types';
import type { Homography } from '@shared/tracer/calibrate';
import { buildShotTracerDraw, type ShotForTracer } from '@shared/tracer/draw';

export type ReelRenderOptions = {
  watermark: boolean;
  caption: string | null;
  homography?: Homography | null;
};

export type OverlayLayout = {
  caption: { x: number; y: number; width: number; height: number } | null;
  watermark: { x: number; y: number; width: number; height: number } | null;
};

export type RenderSession = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  fps: number;
  frameCount: number;
  durationMs: number;
  layout: OverlayLayout;
  drawFrame: (index: number) => void;
};

const SHOT_DURATION_MS = 3000;
const OUTRO_DURATION_MS = 2000;
const CAPTION_MARGIN = 24;
const WATERMARK_MARGIN = 24;
const WATERMARK_WIDTH_RATIO = 0.12;

function resolveWatermarkAspect(image: HTMLImageElement | null): number {
  if (!image) {
    return 0.5;
  }
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (naturalWidth > 0 && naturalHeight > 0) {
    return naturalHeight / naturalWidth;
  }
  return 0.5;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = (globalThis.document?.createElement?.('canvas') ?? null) as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error('Unable to create canvas for reel rendering');
  }
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to acquire 2D context for reel rendering');
  }
  context.fillStyle = '#020617';
  context.fillRect(0, 0, width, height);
  return canvas;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function drawTracerCommand(
  ctx: CanvasRenderingContext2D,
  command: Extract<DrawCmd, { t: 'tracer' }>,
  ratio: number,
): void {
  const total = command.pts.length;
  if (total < 2) {
    return;
  }
  const drawCount = clamp(Math.ceil(total * ratio), 2, total);
  ctx.save();
  ctx.strokeStyle = command.color;
  ctx.lineWidth = command.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(command.dash ?? []);
  ctx.beginPath();
  ctx.moveTo(command.pts[0]![0], command.pts[0]![1]);
  for (let i = 1; i < drawCount; i += 1) {
    const point = command.pts[i]!;
    ctx.lineTo(point[0], point[1]);
  }
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);
}

function drawCommand(ctx: CanvasRenderingContext2D, command: DrawCmd, ratio: number): void {
  switch (command.t) {
    case 'bg':
      ctx.fillStyle = command.color;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      break;
    case 'bar':
      ctx.fillStyle = command.color;
      ctx.fillRect(command.x, command.y, command.w, command.h);
      break;
    case 'text':
      if (ratio < 0.6) {
        return;
      }
      ctx.fillStyle = command.color;
      ctx.font = `${command.bold ? '600' : '400'} ${command.size}px "Inter", "Helvetica Neue", sans-serif`;
      ctx.textAlign = command.align ?? 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(command.text, command.x, command.y);
      break;
    case 'tracer':
      drawTracerCommand(ctx, command, ratio);
      break;
    case 'dot':
      if (ratio < 0.75) {
        return;
      }
      ctx.fillStyle = command.color;
      ctx.beginPath();
      ctx.arc(command.x, command.y, command.r, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'compass':
      if (ratio < 0.75) {
        return;
      }
      ctx.strokeStyle = command.color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(command.cx, command.cy, command.radius, 0, Math.PI * 2);
      ctx.stroke();
      const rad = ((command.deg ?? 0) - 90) * (Math.PI / 180);
      const pointerX = command.cx + Math.cos(rad) * command.radius;
      const pointerY = command.cy + Math.sin(rad) * command.radius;
      ctx.beginPath();
      ctx.moveTo(command.cx, command.cy);
      ctx.lineTo(pointerX, pointerY);
      ctx.stroke();
      break;
    default:
      break;
  }
}

async function loadWatermarkImage(): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') {
    return null;
  }
  const image = new Image();
  image.src = '/brand/watermark.svg';
  if (typeof image.decode === 'function') {
    try {
      await image.decode();
      return image;
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
  });
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  caption: string | null,
  layout: OverlayLayout['caption'],
): void {
  if (!caption || !layout) {
    return;
  }
  ctx.save();
  ctx.fillStyle = '#020617cc';
  ctx.fillRect(layout.x, layout.y, layout.width, layout.height);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 48px "Inter", "Helvetica Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const centerX = layout.x + layout.width / 2;
  const centerY = layout.y + layout.height / 2;
  ctx.fillText(caption, centerX, centerY);
  ctx.restore();
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  layout: OverlayLayout['watermark'],
  watermarkImage: HTMLImageElement | null,
): void {
  if (!layout || layout.width <= 0 || layout.height <= 0) {
    return;
  }
  if (watermarkImage) {
    ctx.drawImage(watermarkImage, layout.x, layout.y, layout.width, layout.height);
    return;
  }
  ctx.save();
  ctx.fillStyle = '#38bdf8';
  ctx.font = '600 36px "Inter", "Helvetica Neue", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('GolfIQ', layout.x + layout.width, layout.y);
  ctx.restore();
}

function drawOutro(
  ctx: CanvasRenderingContext2D,
  layout: OverlayLayout['watermark'],
  watermarkImage: HTMLImageElement | null,
): void {
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#38bdf8';
  ctx.font = '700 96px "Inter", "Helvetica Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GolfIQ', ctx.canvas.width / 2, ctx.canvas.height / 2 - 48);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '500 56px "Inter", "Helvetica Neue", sans-serif';
  ctx.fillText('Shot Tracer', ctx.canvas.width / 2, ctx.canvas.height / 2 + 36);
  if (layout) {
    drawWatermark(ctx, layout, watermarkImage);
  }
}

export function computeOverlayLayout(
  preset: ReelExportPreset,
  options: ReelRenderOptions,
  watermarkAspectRatio = 0.5,
): OverlayLayout {
  const captionAvailable = Math.max(0, preset.safe.bottom - CAPTION_MARGIN);
  const captionHeight = options.caption
    ? Math.max(0, Math.min(220, captionAvailable))
    : 0;
  const captionRect = options.caption && captionHeight > 0
    ? {
        x: CAPTION_MARGIN,
        y: preset.h - CAPTION_MARGIN - captionHeight,
        width: Math.max(0, preset.w - CAPTION_MARGIN * 2),
        height: captionHeight,
      }
    : null;
  const safeTop = Math.max(0, preset.safe.top);
  const safeRight = Math.max(0, preset.safe.right ?? WATERMARK_MARGIN);
  let watermarkRect: OverlayLayout['watermark'] = null;
  if (options.watermark) {
    const maxWidth = Math.max(0, Math.round(preset.w * WATERMARK_WIDTH_RATIO));
    const maxHeight = Math.max(0, Math.round(maxWidth * Math.max(watermarkAspectRatio, 0.1)));
    let width = maxWidth;
    let height = maxHeight;
    if (height > safeTop && safeTop > 0) {
      const scale = safeTop / height;
      width = Math.max(0, Math.round(width * scale));
      height = Math.max(0, Math.round(height * scale));
    }
    const x = Math.max(0, preset.w - safeRight - width);
    const y = Math.max(0, safeTop - height);
    watermarkRect = {
      width,
      height,
      x,
      y,
    };
  }
  return { caption: captionRect, watermark: watermarkRect };
}

export async function renderFramesToCanvas(
  shots: ShotForTracer[],
  preset: ReelExportPreset,
  options: ReelRenderOptions,
): Promise<RenderSession> {
  if (!Array.isArray(shots) || shots.length === 0) {
    throw new Error('No shots available for encoding');
  }
  const canvas = createCanvas(preset.w, preset.h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to acquire 2D context');
  }
  const fps = Math.max(1, Math.round(preset.fps));
  const shotFrameCount = Math.max(1, Math.round((SHOT_DURATION_MS / 1000) * fps));
  const outroFrameCount = Math.max(1, Math.round((OUTRO_DURATION_MS / 1000) * fps));
  const frameCount = shots.length * shotFrameCount + outroFrameCount;
  const durationMs = Math.round((frameCount / fps) * 1000);
  const watermarkImage = options.watermark ? await loadWatermarkImage() : null;
  const layout = computeOverlayLayout(preset, options, resolveWatermarkAspect(watermarkImage));

  const tracerResults = shots.map((shot) =>
    buildShotTracerDraw(shot, { width: preset.w, height: preset.h, H: options.homography ?? null }) ?? null,
  );

  const drawFrame = (index: number) => {
    ctx.clearRect(0, 0, preset.w, preset.h);
    const outroStart = shots.length * shotFrameCount;
    if (index >= outroStart) {
      drawOutro(ctx, layout.watermark, watermarkImage);
      return;
    }
    const shotIndex = Math.min(shots.length - 1, Math.floor(index / shotFrameCount));
    const frameInShot = index - shotIndex * shotFrameCount;
    const ratio = clamp(frameInShot / Math.max(1, shotFrameCount - 1), 0, 1);

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, preset.w, preset.h);

    const tracer = tracerResults[shotIndex];
    if (tracer) {
      for (const command of tracer.commands) {
        drawCommand(ctx, command, ratio);
      }
    }

    drawCaption(ctx, options.caption ?? null, layout.caption);
    drawWatermark(ctx, layout.watermark, watermarkImage);
  };

  return {
    canvas,
    ctx,
    fps,
    frameCount,
    durationMs,
    layout,
    drawFrame,
  };
}

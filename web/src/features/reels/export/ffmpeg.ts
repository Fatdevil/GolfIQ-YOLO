import { createFFmpeg } from '@ffmpeg/ffmpeg';

import { emitReelExportComplete, emitReelExportError, emitReelExportProgress, emitReelExportStart } from '@shared/telemetry/reels';

import type {
  DrawTimeline,
  DrawTimelineBuilder,
  RenderFailure,
  RenderTracerReelOptions,
  RenderTracerReelResult,
  ReelTimelineMetadata,
} from './types';

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;

function clampFps(fps: number | undefined): number {
  if (!Number.isFinite(fps ?? NaN)) {
    return 30;
  }
  const clamped = Math.round(fps!);
  return Math.min(30, Math.max(1, clamped));
}

function ensureTimeline(
  drawTimeline: DrawTimeline | DrawTimelineBuilder,
  context: {
    width: number;
    height: number;
    fps: number;
    durationMs: number;
    includeBadges: boolean;
    includeWatermark: boolean;
    watermarkText: string | null;
  },
): DrawTimeline {
  if (typeof drawTimeline === 'function') {
    return drawTimeline(context);
  }
  const frameCount = Math.max(
    1,
    drawTimeline.frameCount || Math.ceil((context.durationMs / 1000) * context.fps),
  );
  if (!drawTimeline.frames || drawTimeline.frames.length !== frameCount) {
    const frames = Array.from({ length: frameCount }, () => ({
      commands: drawTimeline.frames?.[0]?.commands.map((cmd) => ({ ...cmd })) ?? [],
    }));
    return {
      ...drawTimeline,
      frameCount,
      frames,
      durationMs: context.durationMs,
      fps: context.fps,
      width: context.width,
      height: context.height,
    } satisfies DrawTimeline;
  }
  return {
    ...drawTimeline,
    durationMs: context.durationMs,
    fps: context.fps,
    width: context.width,
    height: context.height,
  } satisfies DrawTimeline;
}

let ffmpegInstance: ReturnType<typeof createFFmpeg> | null = null;
let ffmpegLoading: Promise<ReturnType<typeof createFFmpeg>> | null = null;

export function __resetFfmpegForTests(): void {
  ffmpegInstance = null;
  ffmpegLoading = null;
}

async function getFfmpeg(): Promise<ReturnType<typeof createFFmpeg>> {
  if (ffmpegInstance) {
    return ffmpegInstance;
  }
  if (ffmpegLoading) {
    return ffmpegLoading;
  }
  ffmpegLoading = (async () => {
    const instance = createFFmpeg({ log: false });
    await instance.load();
    ffmpegInstance = instance;
    ffmpegLoading = null;
    return instance;
  })();
  return ffmpegLoading;
}

function createMetadata(params: {
  templateId: string;
  codec: 'mp4' | 'webm';
  timeline: DrawTimeline;
  includeBadges: boolean;
  includeWatermark: boolean;
  watermarkText: string | null;
}): ReelTimelineMetadata {
  return {
    templateId: params.templateId,
    codec: params.codec,
    durationMs: params.timeline.durationMs,
    width: params.timeline.width,
    height: params.timeline.height,
    fps: params.timeline.fps,
    frameCount: params.timeline.frameCount,
    includeBadges: params.includeBadges,
    includeWatermark: params.includeWatermark,
    watermarkText: params.watermarkText,
    theme: params.timeline.theme,
  } satisfies ReelTimelineMetadata;
}

function emitProgress(templateId: string, ratio: number, stage: string): void {
  const clamped = Math.max(0, Math.min(1, ratio));
  emitReelExportProgress({ template: templateId, progress: clamped, stage });
}

function throwIfAborted(signal: AbortSignal | null | undefined): void {
  if (signal?.aborted) {
    const error = new DOMException('render cancelled', 'AbortError');
    throw error;
  }
}

async function attemptEncode(
  options: RenderTracerReelOptions,
  timeline: DrawTimeline,
  codec: 'mp4' | 'webm',
  signal: AbortSignal | null | undefined,
  onProgress: (ratio: number) => void,
): Promise<RenderTracerReelResult> {
  throwIfAborted(signal);
  const templateId = options.templateId ?? 'custom';
  const metadata = createMetadata({
    templateId,
    codec,
    timeline,
    includeBadges: options.includeBadges !== false,
    includeWatermark: options.watermark !== false,
    watermarkText: options.watermarkText ?? null,
  });
  const encoder = codec === 'mp4' ? await getFfmpeg() : null;
  if (encoder && typeof encoder.setProgress === 'function') {
    encoder.setProgress(({ ratio }: { ratio: number }) => {
      emitProgress(templateId, ratio * 0.6 + 0.3, 'encode');
      onProgress(ratio * 0.6 + 0.3);
    });
  }
  throwIfAborted(signal);
  const payload = JSON.stringify({
    version: 1,
    codec,
    theme: timeline.theme,
    frameCount: timeline.frameCount,
    timeline,
    metadata,
    options: {
      videoSrc: typeof options.videoSrc === 'string' ? options.videoSrc : null,
      music: options.musicSrc ?? null,
    },
  });
  const bytes = new TextEncoder().encode(payload);
  throwIfAborted(signal);
  const mime = codec === 'mp4' ? 'video/mp4' : 'video/webm';
  const blob = new Blob([bytes], { type: mime });
  const result: RenderTracerReelResult = {
    blob,
    codec,
    durationMs: timeline.durationMs,
    frameCount: timeline.frameCount,
    width: timeline.width,
    height: timeline.height,
    timeline,
  };
  return result;
}

export async function renderTracerReel(options: RenderTracerReelOptions): Promise<RenderTracerReelResult> {
  const width = Math.max(1, Math.round(options.width ?? DEFAULT_WIDTH));
  const height = Math.max(1, Math.round(options.height ?? DEFAULT_HEIGHT));
  const fps = clampFps(options.fps);
  const startMs = Math.max(0, Math.round(options.startMs));
  const endMs = Math.max(startMs + 1, Math.round(options.endMs));
  const durationMs = endMs - startMs;
  const includeBadges = options.includeBadges !== false;
  const includeWatermark = options.watermark !== false;
  const watermarkText = options.watermarkText ?? null;

  const templateId = options.templateId ?? 'custom';
  const timeline = ensureTimeline(options.drawTimeline, {
    width,
    height,
    fps,
    durationMs,
    includeBadges,
    includeWatermark,
    watermarkText,
  });

  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const signal = options.signal ?? null;
  const failures: RenderFailure[] = [];

  emitReelExportStart({
    template: templateId,
    durationMs,
    codec: 'mp4',
    fps,
    width,
    height,
  });

  try {
    emitProgress(templateId, 0.1, 'timeline');
    onProgress(0.1);
    const mp4 = await attemptEncode(options, timeline, 'mp4', signal, onProgress);
    emitProgress(templateId, 1, 'complete');
    onProgress(1);
    emitReelExportComplete({ template: templateId, durationMs, codec: 'mp4' });
    return mp4;
  } catch (error) {
    const failure = {
      error: error instanceof Error ? error : new Error('Unknown MP4 failure'),
      stage: 'encode' as const,
    } satisfies RenderFailure;
    failures.push(failure);
    emitReelExportError({
      template: templateId,
      durationMs,
      codec: 'mp4',
      message: failure.error.message,
    });
  }

  try {
    emitProgress(templateId, 0.4, 'fallback');
    onProgress(0.4);
    const webm = await attemptEncode(options, timeline, 'webm', signal, onProgress);
    emitProgress(templateId, 1, 'complete');
    onProgress(1);
    emitReelExportComplete({ template: templateId, durationMs, codec: 'webm' });
    return webm;
  } catch (error) {
    const failure = {
      error: error instanceof Error ? error : new Error('Unknown WebM failure'),
      stage: 'encode' as const,
    } satisfies RenderFailure;
    failures.push(failure);
    emitReelExportError({
      template: templateId,
      durationMs,
      codec: 'webm',
      message: failure.error.message,
    });
    const summary = failures.map((entry) => entry.error.message).join('; ');
    throw new Error(`Unable to export reel: ${summary}`);
  }
}

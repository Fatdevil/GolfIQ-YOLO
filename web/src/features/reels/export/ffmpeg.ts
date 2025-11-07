import { createFFmpeg } from '@ffmpeg/ffmpeg';

import {
  emitReelExportComplete,
  emitReelExportError,
  emitReelExportProgress,
  emitReelExportStart,
} from '@shared/telemetry/reels';

import type {
  DrawTimeline,
  DrawTimelineBuilder,
  RenderTracerReelOptions,
  RenderTracerReelResult,
} from './types';

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_FPS = 30;

let ffmpegInstance: ReturnType<typeof createFFmpeg> | null = null;
let ffmpegLoading: Promise<ReturnType<typeof createFFmpeg>> | null = null;

export function __resetFfmpegForTests(): void {
  ffmpegInstance = null;
  ffmpegLoading = null;
}

function clampFps(fps: number | undefined): number {
  if (!Number.isFinite(fps ?? NaN)) {
    return DEFAULT_FPS;
  }
  const rounded = Math.round(fps!);
  return Math.max(1, Math.min(DEFAULT_FPS, rounded));
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
    const frames = Array.from({ length: frameCount }, (_, index) => ({
      commands: drawTimeline.frames?.[Math.min(index, drawTimeline.frames.length - 1)]?.commands
        .map((cmd) => ({ ...cmd })) ?? [],
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

function throwIfAborted(signal: AbortSignal | null | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

function emitProgress(templateId: string, ratio: number, stage: string): void {
  const clamped = Math.max(0, Math.min(1, ratio));
  emitReelExportProgress({ template: templateId, progress: clamped, stage });
}

function drawOverlayCommands(
  ctx: CanvasRenderingContext2D,
  timeline: DrawTimeline,
  frameIndex: number,
): void {
  const commands = timeline.frames[Math.min(frameIndex, timeline.frames.length - 1)]?.commands ?? [];
  ctx.save();
  for (const cmd of commands) {
    switch (cmd.t) {
      case 'bg': {
        break;
      }
      case 'bar': {
        ctx.fillStyle = cmd.color;
        ctx.fillRect(cmd.x, cmd.y, cmd.w, cmd.h);
        break;
      }
      case 'tracer': {
        if (!cmd.pts.length) {
          break;
        }
        ctx.strokeStyle = cmd.color;
        ctx.lineWidth = cmd.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash(cmd.dash ?? []);
        ctx.beginPath();
        ctx.moveTo(cmd.pts[0][0], cmd.pts[0][1]);
        for (let i = 1; i < cmd.pts.length; i += 1) {
          ctx.lineTo(cmd.pts[i][0], cmd.pts[i][1]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      }
      case 'dot': {
        ctx.fillStyle = cmd.color;
        ctx.beginPath();
        ctx.arc(cmd.x, cmd.y, cmd.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'text': {
        ctx.fillStyle = cmd.color;
        ctx.font = `${cmd.bold ? '600' : '400'} ${cmd.size}px "Inter", "Helvetica Neue", sans-serif`;
        ctx.textAlign = cmd.align ?? 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(cmd.text, cmd.x, cmd.y);
        break;
      }
      case 'compass': {
        ctx.strokeStyle = cmd.color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cmd.cx, cmd.cy, cmd.radius, 0, Math.PI * 2);
        ctx.stroke();
        const rad = ((cmd.deg ?? 0) - 90) * (Math.PI / 180);
        const pointerX = cmd.cx + Math.cos(rad) * cmd.radius;
        const pointerY = cmd.cy + Math.sin(rad) * cmd.radius;
        ctx.beginPath();
        ctx.moveTo(cmd.cx, cmd.cy);
        ctx.lineTo(pointerX, pointerY);
        ctx.stroke();
        break;
      }
      default:
        break;
    }
  }
  ctx.restore();
}

async function loadMediaSource(
  element: HTMLMediaElement,
  source: string | ArrayBuffer | Uint8Array | Blob | null | undefined,
  signal: AbortSignal | null | undefined,
): Promise<{ cleanup: () => void } | null> {
  if (!source) {
    return null;
  }
  let objectUrl: string | null = null;
  if (typeof source === 'string') {
    element.src = source;
  } else if (source instanceof Blob) {
    objectUrl = URL.createObjectURL(source);
    element.src = objectUrl;
  } else if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
    const data: BlobPart = source instanceof Uint8Array ? source.slice() : new Uint8Array(source);
    const blob = new Blob([data], { type: 'video/mp4' });
    objectUrl = URL.createObjectURL(blob);
    element.src = objectUrl;
  } else {
    return null;
  }
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      element.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const onError = (event: Event) => {
      element.removeEventListener('loadeddata', onLoaded);
      signal?.removeEventListener('abort', onAbort);
      reject(event instanceof ErrorEvent ? event.error : new Error('Media failed to load'));
    };
    const onAbort = () => {
      element.removeEventListener('loadeddata', onLoaded);
      element.removeEventListener('error', onError);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    element.addEventListener('loadeddata', onLoaded, { once: true });
    element.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  return {
    cleanup: () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    },
  };
}

type CompositeRenderer = {
  video: HTMLVideoElement | null;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  totalFrames: number;
  drawFrame: (frameIndex: number) => void;
  teardown: () => void;
  audioTracks: MediaStreamTrack[];
};

async function setupCompositeRenderer({
  videoSrc,
  width,
  height,
  fps,
  startMs,
  endMs,
  timeline,
  musicSrc,
  signal,
}: {
  videoSrc: string | ArrayBuffer | Uint8Array | Blob | null | undefined;
  width: number;
  height: number;
  fps: number;
  startMs: number;
  endMs: number;
  timeline: DrawTimeline;
  musicSrc: string | null | undefined;
  signal: AbortSignal | null | undefined;
}): Promise<CompositeRenderer> {
  throwIfAborted(signal);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to acquire 2D context for export canvas');
  }

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  video.controls = false;
  video.playbackRate = 1;

  const cleanupCallbacks: Array<() => void> = [];
  let videoLoaded = false;
  try {
    const videoCleanup = await loadMediaSource(video, videoSrc ?? null, signal);
    if (videoCleanup) {
      cleanupCallbacks.push(videoCleanup.cleanup);
      videoLoaded = true;
    }
  } catch (error) {
    console.warn('[reels] failed to load source video, using blank background', error);
  }

  const startSeconds = Math.max(0, startMs / 1000);
  const endSeconds = Math.max(startSeconds, endMs / 1000);
  if (videoLoaded) {
    try {
      video.currentTime = startSeconds;
      void video.pause();
    } catch (error) {
      console.warn('[reels] unable to seek video to start', error);
    }
  }

  const audioTracks: MediaStreamTrack[] = [];
  if (videoLoaded && typeof (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream === 'function') {
    try {
      const stream = (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream();
      for (const track of stream.getAudioTracks()) {
        audioTracks.push(track);
      }
    } catch (error) {
      console.warn('[reels] unable to capture audio from source video', error);
    }
  }

  if (musicSrc) {
    const audio = document.createElement('audio');
    audio.crossOrigin = 'anonymous';
    audio.loop = true;
    audio.preload = 'auto';
    try {
      const musicCleanup = await loadMediaSource(audio, musicSrc, signal);
      if (musicCleanup) {
        cleanupCallbacks.push(musicCleanup.cleanup);
      }
      audio.volume = 0.55;
      if (typeof (audio as HTMLAudioElement & { captureStream?: () => MediaStream }).captureStream === 'function') {
        const stream = (audio as HTMLAudioElement & { captureStream: () => MediaStream }).captureStream();
        for (const track of stream.getAudioTracks()) {
          audioTracks.push(track);
        }
      }
      void audio.play().catch(() => {
        /* ignore */
      });
      cleanupCallbacks.push(() => {
        audio.pause();
        audio.src = '';
      });
    } catch (error) {
      console.warn('[reels] failed to load music source', error);
    }
  }

  const drawVideoFrame = () => {
    if (!videoLoaded || !video.videoWidth || !video.videoHeight) {
      return;
    }
    const sourceAspect = video.videoWidth / video.videoHeight;
    const targetAspect = width / height;
    let drawWidth = width;
    let drawHeight = height;
    if (sourceAspect > targetAspect) {
      drawWidth = width;
      drawHeight = drawWidth / sourceAspect;
    } else {
      drawHeight = height;
      drawWidth = drawHeight * sourceAspect;
    }
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;
    try {
      ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
    } catch (error) {
      console.warn('[reels] failed to draw video frame', error);
    }
  };

  const totalFrames = timeline.frameCount;
  const drawFrame = (frameIndex: number) => {
    const frameCommands = timeline.frames[Math.min(frameIndex, timeline.frames.length - 1)]?.commands ?? [];
    const bg = frameCommands.find((cmd) => cmd.t === 'bg');
    if (bg && bg.t === 'bg') {
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
    if (videoLoaded) {
      const target = Math.min(endSeconds, startSeconds + frameIndex / Math.max(1, fps));
      if (!Number.isNaN(target)) {
        try {
          video.currentTime = target;
        } catch {
          // ignore seek errors
        }
      }
      drawVideoFrame();
    } else if (!bg || bg.t !== 'bg') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
    }
    drawOverlayCommands(ctx, timeline, frameIndex);
  };

  const teardown = () => {
    for (const callback of cleanupCallbacks) {
      try {
        callback();
      } catch {
        // ignore cleanup errors
      }
    }
    if (videoLoaded) {
      try {
        video.pause();
        video.src = '';
      } catch {
        // ignore
      }
    }
    for (const track of audioTracks) {
      try {
        track.stop();
      } catch {
        // ignore
      }
    }
  };

  return { video: videoLoaded ? video : null, canvas, ctx, totalFrames, drawFrame, teardown, audioTracks };
}

function waitForFrameInterval(fps: number): Promise<void> {
  const delayMs = Math.max(1, Math.round(1000 / Math.max(1, fps)));
  if (typeof requestAnimationFrame === 'function') {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

type EncodeParams = {
  canvas: HTMLCanvasElement;
  fps: number;
  totalFrames: number;
  drawFrame: (frameIndex: number) => void;
  signal: AbortSignal | null | undefined;
  audioTracks: MediaStreamTrack[];
};

async function encodeWithMediaRecorder({
  canvas,
  fps,
  totalFrames,
  drawFrame,
  signal,
  audioTracks,
}: EncodeParams): Promise<Blob> {
  throwIfAborted(signal);
  const captureStream = (canvas as HTMLCanvasElement & { captureStream?: (frameRate?: number) => MediaStream }).captureStream;
  if (typeof captureStream !== 'function') {
    throw new Error('Canvas captureStream is not supported in this environment');
  }
  const capture = captureStream.call(canvas, fps);
  for (const track of audioTracks) {
    try {
      capture.addTrack(track);
    } catch (error) {
      console.warn('[reels] failed to attach audio track to capture stream', error);
    }
  }

  const preferredMime = 'video/webm;codecs=vp9,opus';
  const fallbackMime = 'video/webm;codecs=vp8,opus';
  const mime = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(preferredMime)
    ? preferredMime
    : fallbackMime;
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not available in this environment');
  }
  const recorder = new MediaRecorder(capture, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size) {
      chunks.push(event.data);
    }
  };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
    recorder.onerror = (event) => {
      reject(event.error || new Error('MediaRecorder error'));
    };
  });

  recorder.start();
  for (let i = 0; i < totalFrames; i += 1) {
    throwIfAborted(signal);
    drawFrame(i);
    await waitForFrameInterval(fps);
  }
  recorder.stop();
  const blob = await done;
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  return blob;
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

type TranscodeParams = {
  width: number;
  height: number;
  fps: number;
  signal: AbortSignal | null | undefined;
};

async function transcodeWebmToMp4(webm: Blob, { width, height, fps, signal }: TranscodeParams): Promise<Blob> {
  throwIfAborted(signal);
  const ffmpeg = await getFfmpeg();
  throwIfAborted(signal);
  const inputBuffer = new Uint8Array(await webm.arrayBuffer());
  throwIfAborted(signal);
  ffmpeg.FS('writeFile', 'in.webm', inputBuffer);
  throwIfAborted(signal);
  await ffmpeg.run(
    '-i',
    'in.webm',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-r',
    String(fps),
    '-movflags',
    '+faststart',
    '-vf',
    `scale=${width}:${height}:flags=lanczos`,
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    'out.mp4',
  );
  throwIfAborted(signal);
  const output = ffmpeg.FS('readFile', 'out.mp4');
  return new Blob([output.buffer], { type: 'video/mp4' });
}

export async function renderTracerReel(
  options: RenderTracerReelOptions,
  overrideSignal?: AbortSignal | null,
): Promise<RenderTracerReelResult> {
  const width = Math.max(1, Math.round(options.width ?? DEFAULT_WIDTH));
  const height = Math.max(1, Math.round(options.height ?? DEFAULT_HEIGHT));
  const fps = clampFps(options.fps);
  const startMs = Math.max(0, Math.round(options.startMs));
  const endMs = Math.max(startMs + 1, Math.round(options.endMs));
  const durationMs = endMs - startMs;
  const includeBadges = options.includeBadges !== false;
  const includeWatermark = options.watermark !== false;
  const watermarkText = options.watermarkText ?? null;
  const wantMp4 = options.wantMp4 !== false;
  const signal = overrideSignal ?? options.signal ?? null;

  const timeline = ensureTimeline(options.drawTimeline, {
    width,
    height,
    fps,
    durationMs,
    includeBadges,
    includeWatermark,
    watermarkText,
  });

  const templateId = options.templateId ?? 'custom';
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

  emitReelExportStart({
    template: templateId,
    durationMs,
    codec: wantMp4 ? 'mp4' : 'webm',
    fps,
    width,
    height,
  });

  let renderer: CompositeRenderer | null = null;
  try {
    emitProgress(templateId, 0.1, 'prepare');
    onProgress(0.1);
    renderer = await setupCompositeRenderer({
      videoSrc: options.videoSrc ?? null,
      width,
      height,
      fps,
      startMs,
      endMs,
      timeline,
      musicSrc: options.musicSrc ?? null,
      signal,
    });

    emitProgress(templateId, 0.25, 'render');
    onProgress(0.25);
    const webmBlob = await encodeWithMediaRecorder({
      canvas: renderer.canvas,
      fps,
      totalFrames: timeline.frameCount,
      drawFrame: renderer.drawFrame,
      signal,
      audioTracks: renderer.audioTracks,
    });

    emitProgress(templateId, wantMp4 ? 0.65 : 0.9, wantMp4 ? 'transcode' : 'encode');
    onProgress(wantMp4 ? 0.65 : 0.9);

    if (!wantMp4) {
      emitProgress(templateId, 1, 'complete');
      onProgress(1);
      emitReelExportComplete({ template: templateId, durationMs, codec: 'webm' });
      return {
        blob: webmBlob,
        codec: 'webm',
        durationMs,
        frameCount: timeline.frameCount,
        width,
        height,
        timeline,
        metadata: options.metadata ?? null,
        fallback: null,
      } satisfies RenderTracerReelResult;
    }

    try {
      const mp4Blob = await transcodeWebmToMp4(webmBlob, { width, height, fps, signal });
      emitProgress(templateId, 1, 'complete');
      onProgress(1);
      emitReelExportComplete({ template: templateId, durationMs, codec: 'mp4' });
      return {
        blob: mp4Blob,
        codec: 'mp4',
        durationMs,
        frameCount: timeline.frameCount,
        width,
        height,
        timeline,
        metadata: options.metadata ?? null,
        fallback: null,
      } satisfies RenderTracerReelResult;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown MP4 fallback failure';
      emitReelExportError({ template: templateId, durationMs, codec: 'mp4', message: reason });
      emitProgress(templateId, 1, 'complete');
      onProgress(1);
      emitReelExportComplete({ template: templateId, durationMs, codec: 'webm' });
      return {
        blob: webmBlob,
        codec: 'webm',
        durationMs,
        frameCount: timeline.frameCount,
        width,
        height,
        timeline,
        metadata: options.metadata ?? null,
        fallback: { codec: 'mp4', reason },
      } satisfies RenderTracerReelResult;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown export failure';
    emitReelExportError({ template: templateId, durationMs, codec: wantMp4 ? 'mp4' : 'webm', message });
    throw error;
  } finally {
    renderer?.teardown();
  }
}

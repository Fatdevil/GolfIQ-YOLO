import { createFFmpeg } from '@ffmpeg/ffmpeg';

import type { ReelExportPreset } from '@shared/reels/types';

import type { RenderSession } from './renderTimeline';

type EncodeWithFfmpegOptions = {
  preset: ReelExportPreset;
  session: RenderSession;
  includeAudio: boolean;
  signal?: AbortSignal | null;
  onProgress?: (ratio: number) => void;
};

type EncodeResult = { blob: Blob; mime: 'video/mp4' | 'video/webm' };

let ffmpegInstance: ReturnType<typeof createFFmpeg> | null = null;
let ffmpegLoading: Promise<ReturnType<typeof createFFmpeg>> | null = null;

export function __resetFfmpegForTests(): void {
  ffmpegInstance = null;
  ffmpegLoading = null;
}

function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

async function ensureFfmpegLoaded(signal?: AbortSignal | null): Promise<ReturnType<typeof createFFmpeg>> {
  if (!ffmpegInstance) {
    ffmpegInstance = createFFmpeg({ log: true });
  }
  if (!ffmpegLoading) {
    ffmpegLoading = ffmpegInstance.load();
  }
  throwIfAborted(signal);
  await ffmpegLoading;
  throwIfAborted(signal);
  return ffmpegInstance;
}

function decodeBase64(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const bufferCtor = (globalThis as Record<string, unknown>).Buffer as
    | { from: (data: string, encoding: string) => Uint8Array }
    | undefined;
  if (bufferCtor) {
    const result = bufferCtor.from(base64, 'base64');
    return result instanceof Uint8Array ? result : new Uint8Array(result);
  }
  throw new Error('Base64 decoding is not supported in this environment');
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  if (typeof (canvas as any).convertToBlob === 'function') {
    const blob = await (canvas as any).convertToBlob({ type: 'image/png' });
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) {
          resolve(value);
        } else {
          reject(new Error('Unable to serialize canvas to blob'));
        }
      }, 'image/png');
    });
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
  const dataUrl = canvas.toDataURL('image/png');
  return decodeBase64(dataUrl);
}

function safeUnlink(ffmpeg: ReturnType<typeof createFFmpeg>, path: string): void {
  try {
    ffmpeg.FS('unlink', path);
  } catch {
    // ignore
  }
}

export async function encodeWithFfmpeg(options: EncodeWithFfmpegOptions): Promise<EncodeResult> {
  const { preset, session, includeAudio, signal, onProgress } = options;
  const ffmpeg = await ensureFfmpegLoaded(signal);
  const written: string[] = [];
  const cleanup = () => {
    for (const path of written) {
      safeUnlink(ffmpeg, path);
    }
    safeUnlink(ffmpeg, 'out.mp4');
    safeUnlink(ffmpeg, 'out.webm');
  };
  const updateProgress = (ratio: number) => {
    if (typeof onProgress === 'function') {
      onProgress(Math.max(0, Math.min(1, ratio)));
    }
  };
  try {
    const frameCount = session.frameCount;
    updateProgress(0.02);
    for (let i = 0; i < frameCount; i += 1) {
      throwIfAborted(signal);
      session.drawFrame(i);
      const png = await canvasToPng(session.canvas);
      const framePath = `frame_${String(i).padStart(5, '0')}.png`;
      ffmpeg.FS('writeFile', framePath, png);
      written.push(framePath);
      updateProgress(0.05 + (i / Math.max(1, frameCount)) * 0.45);
    }

    let lastLoggedFrame = 0;
    ffmpeg.setLogger(({ message }: { message?: string }) => {
      const match = /frame=\s*(\d+)/.exec(message ?? '');
      if (match) {
        lastLoggedFrame = Number(match[1]) || lastLoggedFrame;
        const encodeProgress = lastLoggedFrame / Math.max(1, frameCount);
        updateProgress(0.55 + encodeProgress * 0.35);
      }
    });

    const durationSeconds = Math.max(0, session.durationMs / 1000);
    const durationArg = durationSeconds > 0 ? durationSeconds.toFixed(3) : '0';
    const sharedArgs = ['-y', '-start_number', '0', '-r', String(session.fps), '-i', 'frame_%05d.png'];
    if (includeAudio) {
      sharedArgs.push('-f', 'lavfi', '-t', durationArg, '-i', 'anullsrc=r=48000:cl=stereo');
    }

    const mp4Args = [
      ...sharedArgs,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      `scale=${preset.w}:${preset.h}:flags=lanczos`,
      '-b:v',
      String(preset.bitrate),
      '-movflags',
      '+faststart',
    ];
    if (includeAudio) {
      mp4Args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
    }
    mp4Args.push('out.mp4');

    try {
      throwIfAborted(signal);
      await ffmpeg.run(...mp4Args);
      updateProgress(0.95);
      const output = ffmpeg.FS('readFile', 'out.mp4');
      const blob = new Blob([output.buffer], { type: 'video/mp4' });
      updateProgress(1);
      return { blob, mime: 'video/mp4' };
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      console.warn('[reels] mp4 encode failed, attempting webm', error);
    }

    const webmArgs = [
      ...sharedArgs,
      '-c:v',
      'libvpx-vp9',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      `scale=${preset.w}:${preset.h}:flags=lanczos`,
      '-b:v',
      String(Math.max(preset.bitrate, 1_000_000)),
    ];
    if (includeAudio) {
      webmArgs.push('-c:a', 'libopus', '-b:a', '128k', '-shortest');
    }
    webmArgs.push('out.webm');

    throwIfAborted(signal);
    await ffmpeg.run(...webmArgs);
    updateProgress(0.95);
    const output = ffmpeg.FS('readFile', 'out.webm');
    const blob = new Blob([output.buffer], { type: 'video/webm' });
    updateProgress(1);
    return { blob, mime: 'video/webm' };
  } finally {
    cleanup();
    ffmpeg.setLogger(() => {});
  }
}

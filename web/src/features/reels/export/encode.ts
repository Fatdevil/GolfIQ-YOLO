import { PRESETS, type ReelExportPresetId } from '@shared/reels/presets';
import type { ReelExportPreset } from '@shared/reels/types';
import type { Homography } from '@shared/tracer/calibrate';
import type { ShotForTracer } from '@shared/tracer/draw';

import { encodeWithFfmpeg } from './encodeWithFfmpeg';
import { encodeWithMediaRecorder } from './encodeWithMediaRecorder';
import { renderFramesToCanvas, type ReelRenderOptions } from './renderTimeline';

export type ReelEncodeOptions = {
  presetId: string;
  watermark?: boolean;
  caption?: string | null;
  audio?: boolean;
  includeBadges?: boolean;
  signal?: AbortSignal;
  onProgress?: (p: number) => void;
  homography?: Homography | null;
};

export type ReelEncodeResult = {
  blob: Blob;
  mime: 'video/mp4' | 'video/webm';
  durationMs: number;
  frameCount: number;
};

type EncodeStage = 'init' | 'encode' | 'finalize';

export class ReelEncodeError extends Error {
  readonly stage: EncodeStage;

  constructor(stage: EncodeStage, message: string, options?: { cause?: unknown }) {
    super(message);
    this.stage = stage;
    if (options?.cause) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

function findPreset(presetId: string): ReelExportPreset | null {
  return PRESETS[presetId as ReelExportPresetId] ?? null;
}

function sanitizeCaption(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function validateEncodedBlob(result: { blob: Blob; mime: 'video/mp4' | 'video/webm' }): Promise<void> {
  const header = new Uint8Array(await result.blob.slice(0, 64).arrayBuffer());
  if (result.mime === 'video/mp4') {
    let found = false;
    for (let i = 0; i < header.length - 3; i += 1) {
      if (header[i] === 0x66 && header[i + 1] === 0x74 && header[i + 2] === 0x79 && header[i + 3] === 0x70) {
        found = true;
        break;
      }
    }
    if (!found) {
      throw new ReelEncodeError('finalize', 'Encoded MP4 missing ftyp signature');
    }
    return;
  }
  const webmSignature = [0x1a, 0x45, 0xdf, 0xa3];
  for (let i = 0; i < webmSignature.length; i += 1) {
    if (header[i] !== webmSignature[i]) {
      throw new ReelEncodeError('finalize', 'Encoded WebM missing EBML signature');
    }
  }
}

export async function encodeReel(
  shots: ShotForTracer[],
  options: ReelEncodeOptions,
): Promise<ReelEncodeResult> {
  if (!Array.isArray(shots) || shots.length === 0) {
    throw new ReelEncodeError('init', 'No shots to encode');
  }
  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const preset = findPreset(options.presetId);
  if (!preset) {
    throw new ReelEncodeError('init', `Unknown preset: ${options.presetId ?? ''}`);
  }

  const renderOptions: ReelRenderOptions = {
    watermark: options.watermark !== false,
    caption: sanitizeCaption(options.caption ?? null),
    homography: options.homography ?? null,
    includeBadges: options.includeBadges === true,
  };
  const includeAudio = options.audio === true;
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

  progress(0);
  let session: Awaited<ReturnType<typeof renderFramesToCanvas>>;
  try {
    session = await renderFramesToCanvas(shots, preset, renderOptions);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ReelEncodeError('init', 'Failed to prepare frames for encoding', { cause: error });
  }
  progress(0.1);

  try {
    const ffmpegResult = await encodeWithFfmpeg({
      preset,
      session,
      includeAudio,
      signal: options.signal ?? null,
      onProgress: (ratio) => progress(0.1 + ratio * 0.7),
    });
    await validateEncodedBlob(ffmpegResult);
    progress(1);
    return {
      blob: ffmpegResult.blob,
      mime: ffmpegResult.mime,
      durationMs: session.durationMs,
      frameCount: session.frameCount,
    } satisfies ReelEncodeResult;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    if (error instanceof ReelEncodeError && error.stage === 'finalize') {
      throw error;
    }
    console.warn('[reels] ffmpeg encoding failed, falling back to MediaRecorder', error);
  }

  let fallbackResult;
  try {
    fallbackResult = await encodeWithMediaRecorder({
      session,
      includeAudio,
      signal: options.signal ?? null,
      onProgress: (ratio) => progress(0.1 + ratio * 0.7),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ReelEncodeError('encode', 'MediaRecorder fallback failed', { cause: error });
  }
  await validateEncodedBlob(fallbackResult);
  progress(1);
  return {
    blob: fallbackResult.blob,
    mime: fallbackResult.mime,
    durationMs: session.durationMs,
    frameCount: session.frameCount,
  } satisfies ReelEncodeResult;
}

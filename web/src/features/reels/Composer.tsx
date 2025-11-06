import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { makeTimeline, pickTopShots, planFrame } from '@shared/reels/select';
import type { DrawCmd, ReelShotRef, ReelTimeline } from '@shared/reels/types';

const PREVIEW_WIDTH = 300;
const PREVIEW_HEIGHT = Math.round(PREVIEW_WIDTH * (16 / 9));

type ReelPayload = {
  shots?: ReelShotRef[];
  timeline?: ReelTimeline;
  fps?: number;
};

function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const globalBuffer =
    typeof globalThis !== 'undefined' ? (globalThis as { Buffer?: { from: (input: string, encoding: string) => Uint8Array | number[] } }).Buffer : undefined;
  if (globalBuffer) {
    const buf = globalBuffer.from(base64, 'base64');
    return buf instanceof Uint8Array ? buf : Uint8Array.from(buf);
  }
  throw new Error('Base64 decoding is not supported in this environment');
}

function decodePayload(raw: string | null): ReelPayload | null {
  if (!raw) {
    return null;
  }
  try {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const bytes = base64ToBytes(padded);
    const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
    let json = '';
    if (decoder) {
      json = decoder.decode(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) {
        json += String.fromCharCode(bytes[i]!);
      }
    }
    return JSON.parse(json);
  } catch (error) {
    console.warn('[Reels] failed to decode payload', error);
    return null;
  }
}

function resolveShots(payload: ReelPayload | null): ReelShotRef[] {
  if (!payload) {
    return [];
  }
  if (payload.timeline?.shots?.length) {
    return payload.timeline.shots.map((entry) => entry.ref).filter(Boolean);
  }
  return Array.isArray(payload.shots) ? payload.shots : [];
}

function drawCommands(
  ctx: CanvasRenderingContext2D,
  timeline: ReelTimeline,
  commands: DrawCmd[],
): void {
  ctx.save();
  ctx.clearRect(0, 0, timeline.width, timeline.height);
  for (const cmd of commands) {
    switch (cmd.t) {
      case 'bg': {
        ctx.fillStyle = cmd.color;
        ctx.fillRect(0, 0, timeline.width, timeline.height);
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
        ctx.beginPath();
        ctx.moveTo(cmd.pts[0][0], cmd.pts[0][1]);
        for (let i = 1; i < cmd.pts.length; i += 1) {
          ctx.lineTo(cmd.pts[i][0], cmd.pts[i][1]);
        }
        ctx.stroke();
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

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const [, base64] = dataUrl.split(',');
  return base64ToBytes(base64 ?? '');
}

async function encodeWithFfmpeg(frames: string[], timeline: ReelTimeline): Promise<Blob> {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();
  try {
    for (let i = 0; i < frames.length; i += 1) {
      const name = `frame${String(i).padStart(5, '0')}.png`;
      await ffmpeg.writeFile(name, dataUrlToUint8Array(frames[i]!));
    }
    await ffmpeg.exec([
      '-r',
      String(timeline.fps),
      '-i',
      'frame%05d.png',
      '-pix_fmt',
      'yuv420p',
      'out.mp4',
    ]);
    const output = await ffmpeg.readFile('out.mp4');
    const data = output instanceof Uint8Array ? output : new TextEncoder().encode(output);
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return new Blob([copy.buffer], { type: 'video/mp4' });
  } finally {
    try {
      await ffmpeg.deleteFile('out.mp4');
      for (let i = 0; i < frames.length; i += 1) {
        const name = `frame${String(i).padStart(5, '0')}.png`;
        await ffmpeg.deleteFile(name);
      }
    } catch (error) {
      // ignore cleanup errors
    }
    ffmpeg.terminate();
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function encodeWithMediaRecorder(
  commandFrames: DrawCmd[][],
  timeline: ReelTimeline,
  canvas: HTMLCanvasElement,
): Promise<Blob> {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No canvas context for MediaRecorder fallback');
  }
  const stream = canvas.captureStream(timeline.fps);
  const mimeCandidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  const mimeType = mimeCandidates.find((candidate) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate),
  );
  if (!mimeType) {
    throw new Error('MediaRecorder with WebM codecs is not supported in this browser');
  }
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size) {
        chunks.push(event.data);
      }
    });
    recorder.addEventListener('stop', () => {
      resolve(new Blob(chunks, { type: mimeType }));
    });
    recorder.addEventListener('error', (event) => {
      reject(event.error ?? new Error('MediaRecorder error'));
    });
  });
  recorder.start();
  const frameDelay = 1000 / Math.max(1, timeline.fps);
  for (const commands of commandFrames) {
    drawCommands(ctx, timeline, commands);
    await sleep(frameDelay);
  }
  await sleep(frameDelay);
  recorder.stop();
  return finished;
}

export default function Composer(): JSX.Element {
  const [params] = useSearchParams();
  const payload = useMemo(() => decodePayload(params.get('payload')), [params]);
  const payloadShots = useMemo(() => resolveShots(payload), [payload]);
  const selectedShots = useMemo(() => {
    if (payloadShots.length) {
      return payloadShots;
    }
    return pickTopShots(Array.isArray(payload?.shots) ? payload.shots : [], 2);
  }, [payload, payloadShots]);
  const timeline = useMemo(() => {
    if (payload?.timeline && payload?.timeline.shots?.length) {
      return {
        ...payload.timeline,
        shots: payload.timeline.shots.map((entry) => ({
          ...entry,
          ref: entry.ref,
        })),
      } satisfies ReelTimeline;
    }
    if (selectedShots.length) {
      return makeTimeline(selectedShots, payload?.timeline?.fps ?? payload?.fps ?? 30);
    }
    return null;
  }, [payload, selectedShots]);

  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  useEffect(() => {
    if (!timeline || !canvasRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    canvas.width = timeline.width;
    canvas.height = timeline.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    let frameIndex = 0;
    let cancelled = false;
    let timer: number | undefined;
    const tick = () => {
      if (!timeline.frames) {
        return;
      }
      drawCommands(ctx, timeline, planFrame(timeline, frameIndex));
      frameIndex = (frameIndex + 1) % timeline.frames;
      if (!cancelled) {
        timer = window.setTimeout(tick, 1000 / Math.max(1, timeline.fps));
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [timeline]);

  const handleBuild = useCallback(async () => {
    if (!timeline || !canvasRef.current) {
      setStatus('No reel payload available.');
      return;
    }
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) {
      setStatus('Unable to access canvas context.');
      return;
    }
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
      setDownloadName(null);
    }
    setBuilding(true);
    setProgress(0);
    setStatus('Rendering frames…');
    const frames: string[] = [];
    const commandFrames: DrawCmd[][] = [];
    for (let frame = 0; frame < timeline.frames; frame += 1) {
      const commands = planFrame(timeline, frame);
      commandFrames.push(commands);
      drawCommands(ctx, timeline, commands);
      frames.push(canvasRef.current.toDataURL('image/png'));
      const pct = (frame + 1) / timeline.frames;
      if (frame % 3 === 0 || frame + 1 === timeline.frames) {
        setProgress(pct);
        await sleep(0);
      }
    }
    setStatus('Encoding MP4 via FFmpeg…');
    try {
      const blob = await encodeWithFfmpeg(frames, timeline);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName('golfiq-reel.mp4');
      setStatus('MP4 ready for download');
      setProgress(1);
    } catch (error) {
      console.error('[Reels] ffmpeg encoding failed', error);
      setStatus('FFmpeg failed, attempting WebM fallback…');
      try {
        const blob = await encodeWithMediaRecorder(commandFrames, timeline, canvasRef.current);
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setDownloadName('golfiq-reel.webm');
        setStatus('WebM fallback ready');
        setProgress(1);
      } catch (fallbackError) {
        console.error('[Reels] MediaRecorder fallback failed', fallbackError);
        setStatus('Unable to encode reel. Please try a different browser.');
      }
    } finally {
      setBuilding(false);
    }
  }, [timeline, downloadUrl]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-50">Auto Reel Composer</h1>
        <p className="text-slate-400">
          Generate a vertical highlight reel with tracer overlays, stat bar, and GolfIQ-YOLO watermark.
        </p>
      </header>
      {!timeline ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-6 text-slate-300">
          Provide a reel payload via the <code className="rounded bg-slate-800 px-1 py-0.5">payload</code> query parameter.
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section className="space-y-6">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-sm uppercase tracking-wide text-slate-500">Live preview</div>
              <div className="mt-4 flex justify-center">
                <canvas
                  ref={canvasRef}
                  style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, borderRadius: '24px' }}
                  className="overflow-hidden border border-slate-800 shadow-lg"
                />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm text-slate-300">
                <div>
                  <dt className="text-slate-500">Frames</dt>
                  <dd className="font-semibold text-slate-100">{timeline.frames}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Duration</dt>
                  <dd className="font-semibold text-slate-100">
                    {(timeline.frames / Math.max(1, timeline.fps)).toFixed(1)} s @ {timeline.fps} fps
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Resolution</dt>
                  <dd className="font-semibold text-slate-100">
                    {timeline.width} × {timeline.height}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Shots</dt>
                  <dd className="font-semibold text-slate-100">{timeline.shots.length}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-sm font-semibold text-slate-200">Shots included</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {timeline.shots.map((entry) => (
                  <li key={entry.ref.id} className="rounded border border-slate-800/60 bg-slate-900/50 px-3 py-2">
                    <div className="font-semibold text-slate-100">
                      {entry.ref.club ?? '—'} · {Math.round(entry.ref.carry_m ?? 0)} m carry
                    </div>
                    <div className="text-xs text-slate-400">
                      Total {Math.round(entry.ref.total_m ?? entry.ref.carry_m ?? 0)} m · PL{' '}
                      {entry.ref.playsLikePct != null ? entry.ref.playsLikePct.toFixed(1) : '0.0'}%
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-50">Export</h2>
              <p className="text-sm text-slate-400">
                Frames are rendered in-memory, then encoded to MP4 via FFmpeg.wasm. If encoding fails, the
                composer will fall back to a WebM recording using MediaRecorder.
              </p>
            </div>
            <button
              type="button"
              onClick={handleBuild}
              disabled={building}
              className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-base font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
            >
              {building ? 'Building…' : 'Build Reel'}
            </button>
            {status ? <p className="text-sm text-slate-300">{status}</p> : null}
            {building || progress > 0 ? (
              <div className="h-2 w-full rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            ) : null}
            {downloadUrl && downloadName ? (
              <a
                href={downloadUrl}
                download={downloadName}
                className="inline-flex w-full items-center justify-center rounded-lg border border-emerald-400 px-4 py-2 text-base font-semibold text-emerald-300 transition hover:bg-emerald-500/10"
              >
                Download {downloadName}
              </a>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}

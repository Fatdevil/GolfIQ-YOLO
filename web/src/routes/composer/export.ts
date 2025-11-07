import type { DrawCmd, ReelTimeline } from '@shared/reels/types';

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
    typeof globalThis !== 'undefined'
      ? ((globalThis as { Buffer?: { from: (input: string, encoding: string) => Uint8Array | number[] } }).Buffer ?? null)
      : null;
  if (globalBuffer) {
    const buf = globalBuffer.from(base64, 'base64');
    return buf instanceof Uint8Array ? buf : Uint8Array.from(buf);
  }
  throw new Error('Base64 decoding is not supported in this environment');
}

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const [, base64] = dataUrl.split(',');
  return base64ToBytes(base64 ?? '');
}

export async function encodeWithFfmpeg(frames: string[], timeline: ReelTimeline): Promise<Blob> {
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

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function encodeWithMediaRecorder(
  commandFrames: DrawCmd[][],
  timeline: ReelTimeline,
  canvas: HTMLCanvasElement,
  render: (ctx: CanvasRenderingContext2D, tl: ReelTimeline, frame: DrawCmd[]) => void,
): Promise<Blob> {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No canvas context for MediaRecorder fallback');
  }
  const stream = canvas.captureStream(timeline.fps);
  const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
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
    render(ctx, timeline, commands);
    await sleep(frameDelay);
  }
  await sleep(frameDelay);
  recorder.stop();
  return finished;
}

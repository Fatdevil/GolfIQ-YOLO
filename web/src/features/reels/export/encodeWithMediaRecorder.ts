import type { RenderSession } from './renderTimeline';
type EncodeWithMediaRecorderOptions = {
  session: RenderSession;
  includeAudio: boolean;
  signal?: AbortSignal | null;
  onProgress?: (ratio: number) => void;
};

type MediaRecorderResult = { blob: Blob; mime: 'video/webm' };

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type AudioHandle = { stream: MediaStream; cleanup: () => void };

async function attachAudio(): Promise<AudioHandle | null> {
  const AudioCtor =
    (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null;
  if (!AudioCtor) {
    return null;
  }
  const context = new AudioCtor();
  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch {
      // ignore resume errors
    }
  }
  const oscillator = context.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.value = 220;
  const gain = context.createGain();
  gain.gain.value = 0.05;
  const destinationNode = context.createMediaStreamDestination();
  oscillator.connect(gain);
  gain.connect(destinationNode);
  oscillator.start();
  const stream = destinationNode.stream;
  const cleanup = () => {
    try {
      oscillator.stop();
    } catch {
      // ignore
    }
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // ignore
      }
    }
    void context.close();
  };
  return { stream, cleanup };
}

export async function encodeWithMediaRecorder(
  options: EncodeWithMediaRecorderOptions,
): Promise<MediaRecorderResult> {
  const { session, includeAudio, signal, onProgress } = options;
  if (typeof (session.canvas as any).captureStream !== 'function') {
    throw new Error('Canvas captureStream is not supported in this browser');
  }
  const stream = (session.canvas as any).captureStream(session.fps) as MediaStream;
  if (!stream) {
    throw new Error('Unable to capture canvas stream');
  }
  let audioHandle: AudioHandle | null = null;
  if (includeAudio) {
    try {
      audioHandle = await attachAudio();
    } catch (error) {
      console.warn('[reels] failed to attach audio to media recorder', error);
    }
  }
  if (audioHandle) {
    for (const track of audioHandle.stream.getAudioTracks()) {
      stream.addTrack(track);
    }
  }

  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
  const chunks: BlobPart[] = [];
  const frameInterval = Math.max(1, Math.round(1000 / Math.max(1, session.fps)));
  let stopped = false;

  const stop = () => {
    if (!stopped) {
      stopped = true;
      recorder.stop();
    }
  };

  if (typeof onProgress === 'function') {
    onProgress(0.02);
  }

  const result = await new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onerror = (event) => {
      reject(event.error ?? new Error('MediaRecorder error'));
    };
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
    recorder.start();

    (async () => {
      for (let i = 0; i < session.frameCount; i += 1) {
        if (signal?.aborted) {
          stop();
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        session.drawFrame(i);
        if (typeof (stream as any).requestFrame === 'function') {
          (stream as any).requestFrame();
        }
        if (typeof onProgress === 'function') {
          onProgress(0.05 + (i / Math.max(1, session.frameCount)) * 0.8);
        }
        await wait(frameInterval);
      }
      stop();
    })().catch(reject);
  });

  try {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (typeof onProgress === 'function') {
      onProgress(1);
    }
    return { blob: result, mime: 'video/webm' };
  } finally {
    audioHandle?.cleanup();
  }
}

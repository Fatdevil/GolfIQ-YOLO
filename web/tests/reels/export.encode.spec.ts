import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ShotForTracer } from '@shared/tracer/draw';

import { encodeReel, ReelEncodeError } from '../../src/features/reels/export/encode';
import { __resetFfmpegForTests } from '../../src/features/reels/export/encodeWithFfmpeg';

const createFfmpegMock = vi.fn();

vi.mock('@ffmpeg/ffmpeg', () => ({
  createFFmpeg: () => createFfmpegMock(),
}));

class FakeCanvasContext2D {
  fillStyle = '#000000';
  strokeStyle = '#000000';
  lineWidth = 1;
  font = '';
  textAlign: CanvasTextAlign = 'left';
  textBaseline: CanvasTextBaseline = 'alphabetic';

  save(): void {}
  restore(): void {}
  clearRect(): void {}
  fillRect(): void {}
  drawImage(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  stroke(): void {}
  setLineDash(): void {}
  arc(): void {}
  fill(): void {}
  fillText(): void {}
}

class FakeCanvasElement {
  width = 0;
  height = 0;

  getContext(): FakeCanvasContext2D {
    const ctx = new FakeCanvasContext2D();
    (ctx as any).canvas = this;
    return ctx;
  }

  toDataURL(): string {
    return 'data:image/png;base64,AAAA';
  }

  captureStream(): MediaStream {
    return new FakeMediaStream() as unknown as MediaStream;
  }
}

class FakeMediaStream {
  tracks: MediaStreamTrack[] = [];

  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track);
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  getTracks(): MediaStreamTrack[] {
    return this.tracks;
  }
}

class FakeMediaRecorder {
  static isTypeSupported(): boolean {
    return true;
  }

  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: { error: Error }) => void) | null = null;

  constructor(public readonly stream: MediaStream, public readonly options: { mimeType: string }) {}

  start(): void {
    const header = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
    this.ondataavailable?.({ data: new Blob([header], { type: 'video/webm' }) });
  }

  stop(): void {
    this.onstop?.();
  }
}

let currentFiles: Record<string, Uint8Array> = {};
let currentFfmpeg: any = null;
const textEncoderSpy = vi.fn();

beforeEach(() => {
  vi.restoreAllMocks();
  createFfmpegMock.mockReset();
  textEncoderSpy.mockReset();
  __resetFfmpegForTests();
  currentFiles = {};
  const ffmpegInstance = {
    load: vi.fn().mockResolvedValue(undefined),
    run: vi.fn(async (...args: string[]) => {
      if (args.includes('out.mp4')) {
        currentFiles['out.mp4'] = new Uint8Array([
          0x00,
          0x00,
          0x00,
          0x18,
          0x66,
          0x74,
          0x79,
          0x70,
          0x6d,
          0x70,
          0x34,
          0x32,
        ]);
      } else if (args.includes('out.webm')) {
        currentFiles['out.webm'] = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
      }
    }),
    FS: vi.fn((cmd: string, path: string, data?: Uint8Array) => {
      if (cmd === 'writeFile' && data) {
        currentFiles[path] = data;
        return;
      }
      if (cmd === 'readFile') {
        return currentFiles[path];
      }
      if (cmd === 'unlink') {
        delete currentFiles[path];
        return;
      }
      if (cmd === 'readdir') {
        return Object.keys(currentFiles);
      }
      throw new Error(`Unsupported command ${cmd}`);
    }),
    setLogger: vi.fn(),
  };
  createFfmpegMock.mockReturnValue(ffmpegInstance);
  currentFfmpeg = ffmpegInstance;

  const Canvas = FakeCanvasElement as unknown as typeof HTMLCanvasElement;
  (globalThis as any).HTMLCanvasElement = Canvas;
  (globalThis as any).MediaRecorder = FakeMediaRecorder;
  (globalThis as any).Image = class {
    width = 320;
    height = 160;
    naturalWidth = 320;
    naturalHeight = 160;
    decode = vi.fn(() => Promise.resolve());
    set src(_value: string) {
      // no-op for tests
    }
  };
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return new FakeCanvasElement();
      }
      if (tag === 'video' || tag === 'audio') {
        return {
          play: () => Promise.resolve(),
          pause: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          load: () => {},
        };
      }
      return {};
    },
  };
  (globalThis as any).MediaStream = FakeMediaStream;
  (globalThis as any).TextEncoder = class {
    constructor() {
      textEncoderSpy();
    }

    encode(): Uint8Array {
      return new Uint8Array();
    }
  };
});

function makeShot(): ShotForTracer {
  return {
    tracer: { points: [
      [120, 400],
      [300, 280],
      [420, 160],
      [520, 80],
    ] },
    carry_m: 150,
    apex_m: 40,
  } satisfies ShotForTracer;
}

describe('encodeReel', () => {
  it('encodes a reel with ffmpeg using preset fps and bitrate', async () => {
    const result = await encodeReel([makeShot()], {
      presetId: 'reels_1080x1920_30',
      watermark: true,
      caption: 'Highlight',
      audio: false,
    });

    const ffmpeg = currentFfmpeg!;
    expect(ffmpeg.load).toHaveBeenCalled();
    expect(ffmpeg.run).toHaveBeenCalledWith(
      expect.stringMatching(/^-y$/),
      '-start_number',
      '0',
      '-r',
      '30',
      '-i',
      'frame_%05d.png',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      'scale=1080:1920:flags=lanczos',
      '-b:v',
      '12000000',
      '-movflags',
      '+faststart',
      'out.mp4',
    );
    expect(result.mime).toBe('video/mp4');
    expect(result.frameCount).toBeGreaterThan(0);
    expect(textEncoderSpy).not.toHaveBeenCalled();
  });

  it('includes generated audio via lavfi when audio option is enabled', async () => {
    await encodeReel([makeShot()], {
      presetId: 'reels_1080x1920_30',
      watermark: false,
      caption: null,
      audio: true,
    });

    const ffmpeg = currentFfmpeg!;
    const args = ffmpeg.run.mock.calls[0] as string[];
    expect(args).toContain('-f');
    expect(args).toContain('lavfi');
    expect(args).toContain('anullsrc=r=48000:cl=stereo');
    const tIndex = args.indexOf('-t');
    expect(tIndex).toBeGreaterThan(0);
    expect(Number.parseFloat(args[tIndex + 1]!)).toBeGreaterThan(0);
  });

  it('falls back to MediaRecorder when ffmpeg fails', async () => {
    const ffmpeg = currentFfmpeg!;
    ffmpeg.run.mockRejectedValueOnce(new Error('ffmpeg failure'));
    const result = await encodeReel([makeShot()], {
      presetId: 'reels_1080x1920_30',
      watermark: false,
      caption: null,
      audio: false,
    });
    expect(result.mime).toBe('video/webm');
  });

  it('throws a finalize error when encoded output is invalid', async () => {
    const ffmpeg = currentFfmpeg!;
    ffmpeg.run.mockImplementationOnce(async (...args: string[]) => {
      if (args.includes('out.mp4')) {
        currentFiles['out.mp4'] = new Uint8Array([0x00, 0x00, 0x00, 0x01]);
      }
    });
    await expect(
      encodeReel([makeShot()], {
        presetId: 'reels_1080x1920_30',
        watermark: false,
        caption: null,
        audio: false,
      }),
    ).rejects.toMatchObject({ stage: 'finalize' satisfies ReelEncodeError['stage'] });
  });
});

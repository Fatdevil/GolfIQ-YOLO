import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReelShotRef } from '@shared/reels/types';
import type { TracerDrawResult } from '@shared/tracer/draw';

import { __resetFfmpegForTests, renderTracerReel } from '../../src/features/reels/export/ffmpeg';
import { REEL_EXPORT_PRESETS, buildDrawTimeline } from '../../src/features/reels/export/templates';

const createFfmpegMock = vi.fn();
type Scenario = 'webm' | 'mp4' | 'mp4_fail';
let SCENARIO: Scenario = 'webm';

vi.mock('@ffmpeg/ffmpeg', () => ({
  createFFmpeg: (...args: unknown[]) => createFfmpegMock(...args),
}));

class FakeMediaStream {
  private readonly tracks: MediaStreamTrack[] = [];

  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track);
  }

  getTracks(): MediaStreamTrack[] {
    return this.tracks;
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'audio');
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'video');
  }
}

class FakeMediaRecorder {
  static isTypeSupported(): boolean {
    return true;
  }

  public ondataavailable: ((event: { data: Blob }) => void) | null = null;

  public onstop: (() => void) | null = null;

  public onerror: ((event: { error: Error }) => void) | null = null;

  constructor(public readonly stream: FakeMediaStream, options: { mimeType: string }) {
    void options;
  }

  start(): void {
    const header = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00]);
    this.ondataavailable?.({ data: new Blob([header], { type: 'video/webm' }) });
  }

  stop(): void {
    this.onstop?.();
  }
}

class FakeCanvasContext2D {
  fillStyle = '#000000';
  strokeStyle = '#000000';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'round';
  lineJoin: CanvasLineJoin = 'round';
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

class FakeMediaElement {
  currentTime = 0;
  paused = true;
  volume = 1;
  loop = false;
  src = '';
  crossOrigin: string | null = null;
  muted = false;
  preload = 'auto';
  playsInline = true;
  controls = false;
  playbackRate = 1;
  videoWidth = 0;
  videoHeight = 0;
  private listeners: Record<string, Set<EventListener>> = {};

  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners[type]) {
      this.listeners[type] = new Set();
    }
    this.listeners[type]!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners[type]?.delete(listener);
  }

  dispatchEvent(type: string): void {
    for (const listener of this.listeners[type] ?? []) {
      listener.call(this, new Event(type));
    }
  }

  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  captureStream(): FakeMediaStream {
    return new FakeMediaStream();
  }
}

beforeAll(() => {
  const CanvasElement: any = (globalThis as any).HTMLCanvasElement ?? class {};
  if (!(globalThis as any).HTMLCanvasElement) {
    (globalThis as any).HTMLCanvasElement = CanvasElement;
  }
  Object.defineProperty(CanvasElement.prototype, 'getContext', {
    value: function getContext() {
      return new FakeCanvasContext2D();
    },
  });
  Object.defineProperty(CanvasElement.prototype, 'captureStream', {
    value: function captureStream() {
      return new FakeMediaStream();
    },
  });
  if (!(globalThis as any).document) {
    (globalThis as any).document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') {
          return new CanvasElement();
        }
        if (tag === 'video' || tag === 'audio') {
          return new FakeMediaElement();
        }
        return {};
      },
    };
  }
});

beforeEach(() => {
  const files: Record<string, Uint8Array> = {};
  SCENARIO = 'webm';
  createFfmpegMock.mockReset();
  createFfmpegMock.mockReturnValue({
    load: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockImplementation(async () => {
      if (SCENARIO === 'mp4_fail') {
        throw new Error('transcode failure');
      }
      if (SCENARIO === 'mp4') {
        files['out.mp4'] = new Uint8Array([
          0x00,
          0x00,
          0x00,
          0x18,
          0x66,
          0x74,
          0x79,
          0x70,
          0x69,
          0x73,
          0x6f,
          0x6d,
        ]);
      }
    }),
    FS: vi.fn().mockImplementation((cmd: string, path: string, data?: Uint8Array) => {
      if (cmd === 'writeFile' && data) {
        files[path] = data;
        return;
      }
      if (cmd === 'readFile') {
        return files[path];
      }
      throw new Error(`Unsupported FS command ${cmd}`);
    }),
  });
  __resetFfmpegForTests();
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder as unknown as typeof MediaRecorder);
  vi.stubGlobal('MediaStream', FakeMediaStream as unknown as typeof MediaStream);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const baseShot: ReelShotRef = {
  id: 'shot-1',
  ts: 0,
  club: '7I',
  carry_m: 165,
  tracer: {
    points: [
      [100, 1800],
      [400, 900],
      [600, 520],
    ],
  },
};

function makeFit(source: 'raw' | 'computed'): TracerDrawResult {
  return {
    commands: [
      {
        t: 'tracer',
        pts: [
          [120, 1700],
          [500, 900],
          [720, 400],
        ],
        color: '#00e6ff',
        width: 6,
        dash: source === 'raw' ? undefined : [18, 14],
      },
      { t: 'dot', x: 500, y: 900, r: 12, color: '#ffe600' },
      { t: 'text', x: 500, y: 860, text: 'Apex 32 m', size: 36, color: '#ffe600', align: 'center', bold: true },
    ],
    estimated: source !== 'raw',
    sampleCount: 42,
    flags: [],
    source,
  } satisfies TracerDrawResult;
}

describe('reels/export templates', () => {
  it('marks dashed tracer when fit is estimated', () => {
    const builder = buildDrawTimeline(baseShot, makeFit('computed'), 'classic');
    const timeline = builder({
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 5000,
      includeBadges: true,
      includeWatermark: true,
      watermarkText: 'GolfIQ-YOLO',
    });
    expect(timeline.tracerStyle).toBe('dashed');
    const tracerCommand = timeline.frames[0]?.commands.find((cmd) => cmd.t === 'tracer');
    expect(tracerCommand).toBeTruthy();
    expect(tracerCommand?.t).toBe('tracer');
    expect((tracerCommand as Extract<typeof tracerCommand, { t: 'tracer' }>)?.dash).toBeTruthy();

    const solidBuilder = buildDrawTimeline(baseShot, makeFit('raw'), 'classic');
    const solidTimeline = solidBuilder({
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 5000,
      includeBadges: true,
      includeWatermark: true,
      watermarkText: 'GolfIQ-YOLO',
    });
    expect(solidTimeline.tracerStyle).toBe('solid');
    const solidTracer = solidTimeline.frames[0]?.commands.find((cmd) => cmd.t === 'tracer');
    expect((solidTracer as Extract<typeof solidTracer, { t: 'tracer' }> | undefined)?.dash).toBeUndefined();
  });

  it('keeps badges within frame bounds', () => {
    const builder = buildDrawTimeline(baseShot, makeFit('raw'), 'classic');
    for (const preset of REEL_EXPORT_PRESETS) {
      const timeline = builder({
        width: preset.width,
        height: preset.height,
        fps: preset.fps,
        durationMs: 4000,
        includeBadges: true,
        includeWatermark: true,
        watermarkText: 'GolfIQ-YOLO',
      });
      const { carry, club } = timeline.layout.badges ?? {};
      expect(carry).toBeTruthy();
      expect(club).toBeTruthy();
      if (carry && club) {
        expect(carry.x).toBeGreaterThanOrEqual(0);
        expect(club.x).toBeGreaterThanOrEqual(0);
        expect(carry.x + carry.width).toBeLessThanOrEqual(preset.width);
        expect(club.x + club.width).toBeLessThanOrEqual(preset.width);
        expect(carry.y).toBeGreaterThanOrEqual(0);
        expect(club.y + club.height).toBeLessThanOrEqual(preset.height);
      }
    }
  });
});

describe('reels/export ffmpeg wrapper', () => {
  it('encodes a WebM reel when MP4 not requested', async () => {
    const builder = buildDrawTimeline(baseShot, makeFit('raw'), 'classic');
  const result = await renderTracerReel({
      drawTimeline: builder,
      startMs: 0,
      endMs: 7000,
      fps: 30,
      templateId: 'webm-only',
      wantMp4: false,
    });
    expect(result.codec).toBe('webm');
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0x1a);
    expect(bytes[1]).toBe(0x45);
  });

  it('transcodes to MP4 when requested', async () => {
    const builder = buildDrawTimeline(baseShot, makeFit('raw'), 'classic');
  SCENARIO = 'mp4';
  const result = await renderTracerReel({
      drawTimeline: builder,
      startMs: 0,
      endMs: 4000,
      fps: 30,
      templateId: 'mp4',
      wantMp4: true,
    });
    expect(result.codec).toBe('mp4');
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    expect(bytes.slice(4, 8)).toEqual(new Uint8Array([0x66, 0x74, 0x79, 0x70]));
  });

  it('falls back to WebM when MP4 transcode fails', async () => {
    SCENARIO = 'mp4_fail';
    const builder = buildDrawTimeline(baseShot, makeFit('raw'), 'classic');
    const result = await renderTracerReel({
      drawTimeline: builder,
      startMs: 0,
      endMs: 4000,
      fps: 30,
      templateId: 'mp4-fallback',
      wantMp4: true,
    });
    expect(result.codec).toBe('webm');
    expect(result.fallback).toEqual({ codec: 'mp4', reason: 'transcode failure' });
  });
});

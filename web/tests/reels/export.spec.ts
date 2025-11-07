import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReelShotRef } from '@shared/reels/types';
import type { TracerDrawResult } from '@shared/tracer/draw';

import { __resetFfmpegForTests, renderTracerReel } from '../../src/features/reels/export/ffmpeg';
import { REEL_EXPORT_PRESETS, buildDrawTimeline } from '../../src/features/reels/export/templates';

const createFfmpegMock = vi.fn();

vi.mock('@ffmpeg/ffmpeg', () => ({
  createFFmpeg: (...args: unknown[]) => createFfmpegMock(...args),
}));

const baseShot: ReelShotRef = {
  id: 'shot-1',
  ts: 0,
  club: '7I',
  carry_m: 165,
  tracer: { points: [
    [100, 1800],
    [400, 900],
    [600, 520],
  ] },
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
  };
}

beforeEach(() => {
  createFfmpegMock.mockReset();
  createFfmpegMock.mockReturnValue({
    load: vi.fn().mockResolvedValue(undefined),
    setProgress: vi.fn(),
  });
  __resetFfmpegForTests();
});

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
  it('falls back to WebM when MP4 encoder fails', async () => {
    createFfmpegMock.mockReturnValueOnce({
      load: vi.fn().mockRejectedValue(new Error('ffmpeg init failed')),
      setProgress: vi.fn(),
    });
    const builder = buildDrawTimeline(baseShot, makeFit('raw'), 'classic');
    const result = await renderTracerReel({
      drawTimeline: builder,
      startMs: 0,
      endMs: 3000,
      templateId: 'test',
    });
    expect(result.codec).toBe('webm');
    expect(result.frameCount).toBeGreaterThan(0);
  });

  it('computes frame count from duration and fps', async () => {
    const builder = buildDrawTimeline(baseShot, makeFit('raw'), 'classic');
    const result = await renderTracerReel({
      drawTimeline: builder,
      startMs: 0,
      endMs: 4500,
      fps: 30,
      templateId: 'duration-test',
    });
    const expectedFrames = Math.ceil((4500 / 1000) * 30);
    expect(result.frameCount).toBe(expectedFrames);
    expect(result.timeline.frameCount).toBe(expectedFrames);
  });
});

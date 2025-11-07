import { afterEach, describe, expect, it } from 'vitest';

import type { DrawCmd } from '@shared/reels/types';
import { buildShotTracerDraw } from '@shared/tracer/draw';
import { computeHomography } from '@shared/tracer/calibrate';
import { __setTracerRcForTests } from '@shared/tracer/rc';

afterEach(() => {
  __setTracerRcForTests(null);
});

describe('shared/tracer/draw (web)', () => {
  it('renders solid tracer when calibrated raw points available', () => {
    const tee = { x: 100, y: 1800 };
    const flag = { x: 900, y: 320 };
    const H = computeHomography(tee, flag, 12, 180);
    const shot = {
      id: 'shot-raw',
      tracer: {
        points: [
          [tee.x, tee.y],
          [500, 900],
          [flag.x, flag.y],
        ] as [number, number][],
      },
      carry_m: 180,
      apex_m: 32,
    };
    const result = buildShotTracerDraw(shot, { width: 1080, height: 1920, H });
    expect(result).toBeTruthy();
    expect(result!.source).toBe('raw');
    const tracer = result!.commands.find(
      (cmd): cmd is DrawCmd & { t: 'tracer' } => cmd.t === 'tracer',
    );
    expect(tracer).toBeTruthy();
    expect(tracer!.dash).toBeUndefined();
    expect(result!.tooltip?.estimated).toBe(false);
  });

  it('uses dashed tracer when estimation required', () => {
    __setTracerRcForTests({ 'tracer.requireCalib': true });
    const shot = {
      id: 'shot-est',
      carry_m: 180,
      apex_m: 32,
      tracer: { points: [[0, 0], [600, 900], [1080, 400]] as [number, number][] },
    };
    const result = buildShotTracerDraw(shot, { width: 1080, height: 1920, H: null });
    expect(result).toBeTruthy();
    expect(result!.source).toBe('computed');
    const tracer = result!.commands.find(
      (cmd): cmd is DrawCmd & { t: 'tracer' } => cmd.t === 'tracer',
    );
    expect(tracer).toBeTruthy();
    expect(Array.isArray(tracer!.dash)).toBe(true);
    expect(result!.tooltip?.estimated).toBe(true);
  });
});

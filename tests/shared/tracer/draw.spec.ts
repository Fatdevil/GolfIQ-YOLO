import { afterEach, describe, it, expect } from 'vitest';

import { buildShotTracerDraw } from '../../../shared/tracer/draw';
import { __setTracerRcForTests } from '../../../shared/tracer/rc';

afterEach(() => {
  __setTracerRcForTests(null);
});

describe('buildShotTracerDraw', () => {
  it('renders apex label for measured tracer path', () => {
    const shot = {
      id: 'shot-1',
      carry_m: 160,
      apex_m: 32,
      tracer: { points: [[0, 0], [0.4, 0.6], [1, 0]] },
    };
    const result = buildShotTracerDraw(shot, { width: 1080, height: 1920 });
    expect(result).toBeTruthy();
    expect(result!.source).toBe('raw');
    expect(result!.estimated).toBe(false);
    const tracer = result!.commands.find((cmd) => cmd.t === 'tracer');
    expect(tracer).toBeTruthy();
    expect(tracer!.dash).toBeUndefined();
    expect(result!.estimateLabel).toBeUndefined();
    const apexLabel = result!.commands.find((cmd) => cmd.t === 'text' && cmd.text.startsWith('Apex'));
    expect(apexLabel).toBeTruthy();
    const apexDot = result!.commands.find((cmd) => cmd.t === 'dot');
    expect(apexDot).toBeTruthy();
    expect(tracer!.tooltip).toMatchObject({ estimated: false, carry_m: 160, apex_m: 32 });
  });

  it('adds dashed estimate for ballistic fallback paths', () => {
    const shot = {
      id: 'shot-2',
      carry_m: 180,
      apex_m: 32,
      tracer: undefined,
    };
    const result = buildShotTracerDraw(shot, { width: 1080, height: 1920 });
    expect(result).toBeTruthy();
    expect(result!.source).toBe('computed');
    expect(result!.estimated).toBe(true);
    const tracer = result!.commands.find((cmd) => cmd.t === 'tracer');
    expect(tracer).toBeTruthy();
    expect(Array.isArray(tracer!.dash)).toBe(true);
    expect(result!.estimateLabel).toBe('est.');
    const apexLabel = result!.commands.find(
      (cmd) => cmd.t === 'text' && typeof cmd.text === 'string' && cmd.text.startsWith('Apex'),
    );
    expect(apexLabel).toBeTruthy();
    const apexDot = result!.commands.find((cmd) => cmd.t === 'dot');
    expect(apexDot).toBeTruthy();
    expect(tracer!.tooltip).toMatchObject({ estimated: true, carry_m: 180, apex_m: 32 });
  });

  it('dashes tracer when carry is missing or estimated', () => {
    const shot = {
      id: 'shot-3',
      carry_m: undefined,
      carryEstimated: true,
      apex_m: undefined,
      tracer: undefined,
    };
    const result = buildShotTracerDraw(shot, { width: 1080, height: 1920 });
    expect(result).toBeTruthy();
    const tracer = result!.commands.find((cmd) => cmd.t === 'tracer');
    expect(tracer).toBeTruthy();
    expect(Array.isArray(tracer!.dash)).toBe(true);
    expect(result!.source).toBe('computed');
    expect(result!.estimated).toBe(true);
    expect(result!.estimateLabel).toBe('est.');
    const estLabel = result!.commands.find((cmd) => cmd.t === 'text' && cmd.text === 'est.');
    expect(estLabel).toBeTruthy();
    const apexDot = result!.commands.find((cmd) => cmd.t === 'dot');
    expect(apexDot).toBeTruthy();
    expect(tracer!.tooltip).toMatchObject({ estimated: true });
  });
});

import { describe, expect, it } from 'vitest';

import { breakHint } from '../../../shared/greeniq/break';

describe('breakHint', () => {
  it('returns left aim with slope influence and high confidence', () => {
    const hint = breakHint({
      length_m: 4,
      angleDeg: -2,
      paceRatio: 0.8,
      slope_pct: 2,
      stimp: 10,
    });

    expect(hint.aimSide).toBe('left');
    expect(hint.aimCm).toBeCloseTo(20.8, 5);
    expect(hint.tempoHint).toBe('firmer');
    expect(hint.confidence).toBe('high');
  });

  it('centers aim when angle is negligible and slope missing', () => {
    const hint = breakHint({
      length_m: 2,
      angleDeg: 0.01,
      paceRatio: 1.05,
    });

    expect(hint.aimSide).toBe('center');
    expect(hint.aimCm).toBe(0);
    expect(hint.tempoHint).toBe('good');
    expect(hint.confidence).toBe('low');
  });

  it('clamps aim using custom coefficients and applies stimp adjustment', () => {
    const hint = breakHint({
      length_m: 8,
      angleDeg: 12,
      paceRatio: 1.3,
      slope_pct: 3,
      stimp: 13,
      coeff: {
        max_aim_cm: 40,
        tempo_soft_thresh: 0.9,
        tempo_firm_thresh: 1.1,
      },
    });

    expect(hint.aimSide).toBe('right');
    expect(hint.aimCm).toBeCloseTo(40 * (10 / 13), 5);
    expect(hint.tempoHint).toBe('softer');
    expect(hint.confidence).toBe('high');
  });

  it('handles invalid inputs with safe fallbacks', () => {
    const hint = breakHint({
      length_m: 0,
      angleDeg: 5,
      paceRatio: -0.2,
    });

    expect(hint.aimSide).toBe('unknown');
    expect(hint.aimCm).toBeNull();
    expect(hint.tempoHint).toBe('good');
    expect(hint.confidence).toBe('low');
  });

  it('falls back to default coefficients when overrides are invalid', () => {
    const hint = breakHint({
      length_m: 3,
      angleDeg: 5,
      paceRatio: 1,
      coeff: {
        aim_cm_per_deg_per_m: -5,
        aim_cm_per_pct_per_m2: -10,
        tempo_soft_thresh: -1,
        tempo_firm_thresh: -2,
        max_aim_cm: -30,
      },
    });

    // Defaults yield base = |5| * 3 * 1.2 = 18 cm.
    expect(hint.aimCm).toBeCloseTo(18, 5);
    expect(hint.aimSide).toBe('right');
    expect(hint.tempoHint).toBe('good');
    expect(hint.confidence).toBe('low');
  });
});

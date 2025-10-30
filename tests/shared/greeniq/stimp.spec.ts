import { describe, expect, it } from 'vitest';

import { estimateStimp } from '../../../shared/greeniq/stimp';

describe('estimateStimp', () => {
  it('computes stimp and pace factor from trimmed median', () => {
    const result = estimateStimp([
      { rollout_m: 3.05 },
      { rollout_m: 3.15 },
      { rollout_m: 3.25 },
    ]);
    expect(result.samplesUsed).toBe(1);
    expect(result.medianRollout_m).toBeCloseTo(3.15);
    expect(result.stimpFt).toBeCloseTo(3.15 * 3.28084, 5);
    expect(result.paceFactor).toBeCloseTo(10 / (3.15 * 3.28084));
  });

  it('clamps pace factor for extreme surfaces', () => {
    const result = estimateStimp([
      { rollout_m: 0.6 },
      { rollout_m: 0.58 },
      { rollout_m: 0.62 },
    ]);
    expect(result.paceFactor).toBe(1.5);
    expect(result.stimpFt).toBeGreaterThan(0);
  });

  it('returns baseline when inputs invalid', () => {
    const result = estimateStimp([
      { rollout_m: Number.NaN },
      { rollout_m: -3 },
      { rollout_m: 100 },
    ], { baselineStimp: 9.5 });
    expect(result.samplesUsed).toBe(0);
    expect(result.stimpFt).toBe(9.5);
    expect(result.paceFactor).toBe(1);
    expect(result.medianRollout_m).toBe(0);
  });
});

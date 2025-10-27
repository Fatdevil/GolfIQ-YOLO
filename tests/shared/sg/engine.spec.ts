import { describe, expect, it } from 'vitest';

import { classifyPhase, computeSG } from '../../../shared/sg/engine';

describe('computeSG', () => {
  it('rewards solid approach shots', () => {
    const result = computeSG({
      phase: 'approach',
      startDist_m: 150,
      endDist_m: 6,
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.sgApp).toBeCloseTo(result.total, 5);
    expect(result.expStart).toBeGreaterThan(result.expEnd);
  });

  it('penalises missed greens', () => {
    const result = computeSG({
      phase: 'approach',
      startDist_m: 150,
      endDist_m: 25,
    });

    expect(result.total).toBeLessThan(0);
    expect(result.sgApp).toBeCloseTo(result.total, 5);
  });

  it('includes penalty strokes', () => {
    const result = computeSG({
      phase: 'tee',
      startDist_m: 420,
      endDist_m: 150,
      penalty: true,
    });

    expect(result.sgTee).toBeLessThan(0);
    expect(result.total).toBe(result.sgTee);
    expect(result.strokesTaken).toBe(2);
  });
});

describe('classifyPhase', () => {
  it('classifies tee, approach, short, and putt', () => {
    expect(classifyPhase(420)).toBe('tee');
    expect(classifyPhase(160)).toBe('approach');
    expect(classifyPhase(25)).toBe('short');
    expect(classifyPhase(6)).toBe('putt');
  });
});

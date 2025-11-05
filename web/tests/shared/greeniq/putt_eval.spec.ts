import { describe, expect, it } from 'vitest';

import { evalPace, evalStartLine } from '../../../../shared/greeniq/putt_eval';

describe('evalStartLine', () => {
  it('returns square when stroke stays within tolerance', () => {
    const result = evalStartLine(0, 0.5);
    expect(result.classification).toBe('square');
    expect(result.deltaDeg).toBeCloseTo(0.5);
  });

  it('classifies open strokes when target is left of the face', () => {
    const result = evalStartLine(-1, 1.5);
    expect(result.classification).toBe('open');
    expect(result.deltaDeg).toBeCloseTo(2.5);
  });

  it('classifies closed strokes when target is right of the face', () => {
    const result = evalStartLine(1, -0.5);
    expect(result.classification).toBe('closed');
    expect(result.deltaDeg).toBeCloseTo(-1.5);
  });

  it('treats non-finite inputs as zeroed deltas', () => {
    const result = evalStartLine(Number.NaN, Number.POSITIVE_INFINITY);
    expect(result.classification).toBe('square');
    expect(result.deltaDeg).toBe(0);
  });
});

describe('evalPace', () => {
  it('returns good when carry stays within the tolerance band', () => {
    const result = evalPace(10, 10.25);
    expect(result.classification).toBe('good');
    expect(result.delta_m).toBeCloseTo(0.25);
  });

  it('returns too_soft when carry falls short', () => {
    const result = evalPace(10, 9.5);
    expect(result.classification).toBe('too_soft');
    expect(result.delta_m).toBeCloseTo(-0.5);
  });

  it('returns too_firm when carry runs past', () => {
    const result = evalPace(10, 11.2);
    expect(result.classification).toBe('too_firm');
    expect(result.delta_m).toBeCloseTo(1.2);
  });
});

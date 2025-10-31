import { describe, expect, it } from 'vitest';

import { classifyPhase, computeSG } from '../../../shared/sg/engine';

describe('computeSG', () => {
  it('rewards solid approach shots', () => {
    const result = computeSG({
      phase: 'approach',
      startDist_m: 150,
      endDist_m: 3,
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.sgApp).toBeCloseTo(result.total, 5);
    expect(result.expStart).toBeGreaterThan(result.expEnd);
    expect(result.focus).toBe('approach');
    expect(result.byFocus['approach']).toBeCloseTo(result.total, 5);
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
    expect(result.focus).toBe('recovery');
    expect(result.byFocus['recovery']).toBeCloseTo(result.total, 5);
  });

  it('uses tee baseline for penalty re-tee scenarios', () => {
    const penaltyResult = computeSG({
      phase: 'tee',
      startDist_m: 250,
      endDist_m: 250,
      penalty: true,
    });

    const noPenaltyResult = computeSG({
      phase: 'tee',
      startDist_m: 250,
      endDist_m: 250,
    });

    expect(penaltyResult.expEnd).toBeCloseTo(noPenaltyResult.expEnd, 5);
    expect(penaltyResult.sgTee).toBeLessThan(noPenaltyResult.sgTee);
    expect(classifyPhase(250)).toBe('tee');
  });

  it('maps tee shots to long-drive focus when distance is high', () => {
    const result = computeSG({
      phase: 'tee',
      startDist_m: 260,
      endDist_m: 40,
    });

    expect(result.focus).toBe('long-drive');
    expect(result.byFocus['long-drive']).toBeCloseTo(result.total, 5);
  });

  it('maps shorter approach shots to wedge focus', () => {
    const result = computeSG({
      phase: 'approach',
      startDist_m: 90,
      endDist_m: 5,
    });

    expect(result.focus).toBe('wedge');
    expect(result.byFocus['wedge']).toBeCloseTo(result.total, 5);
  });
});

describe('classifyPhase', () => {
  it('classifies tee, approach, short, and putt', () => {
    expect(classifyPhase(420)).toBe('tee');
    expect(classifyPhase(160)).toBe('approach');
    expect(classifyPhase(25)).toBe('short');
    expect(classifyPhase(6)).toBe('putt');
  });

  it('respects boundary thresholds', () => {
    expect(classifyPhase(12)).toBe('putt');
    expect(classifyPhase(12.1)).toBe('short');
    expect(classifyPhase(30)).toBe('short');
    expect(classifyPhase(30.5)).toBe('approach');
    expect(classifyPhase(220)).toBe('approach');
    expect(classifyPhase(221)).toBe('tee');
  });
});

import { describe, expect, it } from 'vitest';

import { evaluatePutt, type PuttEval } from '../../../shared/greeniq/putt_eval';

const toDegrees = (value: number) => Number(value.toFixed(2));

const polar = (radius: number, angleDeg: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: radius * Math.sin(rad), y: radius * Math.cos(rad) };
};

describe('evaluatePutt', () => {
  const start = { x: 0, y: 0 };
  const hole = { x: 0, y: 10 };

  it('classifies angle boundaries at reference distance', () => {
    const hole = { x: 0, y: 3 };
    const onZero = evaluatePutt({ startPx: start, endPx: hole, holePx: hole });
    expect(onZero.angleClass).toBe('on');
    expect(toDegrees(onZero.angleDeg)).toBe(0);

    const oneDegree = evaluatePutt({
      startPx: start,
      endPx: polar(10, 1),
      holePx: hole,
    });
    expect(oneDegree.angleClass).toBe('on');

    const midAngle = evaluatePutt({
      startPx: start,
      endPx: polar(10, 1.5),
      holePx: hole,
    });
    expect(midAngle.angleClass).toBe('ok');

    const okBoundary = evaluatePutt({
      startPx: start,
      endPx: polar(10, 2),
      holePx: hole,
    });
    expect(okBoundary.angleClass).toBe('ok');

    const offAngle = evaluatePutt({
      startPx: start,
      endPx: polar(10, 2.01),
      holePx: hole,
    });
    expect(offAngle.angleClass).toBe('off');
  });

  it('tightens angle thresholds for long putts', () => {
    const hole = { x: 0, y: 12 };
    const nearCenter = evaluatePutt({ startPx: start, endPx: polar(12, 0.2), holePx: hole });
    expect(nearCenter.angleClass).toBe('on');

    const mid = evaluatePutt({ startPx: start, endPx: polar(12, 0.45), holePx: hole });
    expect(mid.angleClass).toBe('ok');

    const wide = evaluatePutt({ startPx: start, endPx: polar(12, 1), holePx: hole });
    expect(wide.angleClass).toBe('off');

    expect(nearCenter.angleThresholdsDeg?.on).toBeLessThan(0.5);
    expect(nearCenter.angleThresholdsDeg?.ok).toBeLessThan(1);
  });

  it('classifies pace boundaries', () => {
    const soft = evaluatePutt({ startPx: start, endPx: { x: 0, y: 8.4 }, holePx: hole });
    expect(soft.paceClass).toBe('too_soft');

    const goodLow = evaluatePutt({ startPx: start, endPx: { x: 0, y: 8.5 }, holePx: hole });
    expect(goodLow.paceClass).toBe('good');

    const goodHigh = evaluatePutt({ startPx: start, endPx: { x: 0, y: 12 }, holePx: hole });
    expect(goodHigh.paceClass).toBe('good');

    const firm = evaluatePutt({ startPx: start, endPx: { x: 0, y: 12.1 }, holePx: hole });
    expect(firm.paceClass).toBe('too_firm');
  });

  it('returns unknown classes when hole missing', () => {
    const result = evaluatePutt({ startPx: start, endPx: hole });
    expect(result.angleClass).toBe('unknown');
    expect(result.paceClass).toBe('unknown');
  });

  it('guards zero-length vectors', () => {
    const result = evaluatePutt({ startPx: start, endPx: start, holePx: hole });
    expect(result.angleClass).toBe('unknown');
    expect(result.paceClass).toBe('unknown');
    expect(result.angleDeg).toBe(0);
    expect(result.signedAngleDeg).toBe(0);
  });

  it('supports homography path', () => {
    const H = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const result: PuttEval = evaluatePutt({ startPx: start, endPx: hole, holePx: hole, H });
    expect(result.angleClass).toBe('on');
    expect(result.paceClass).toBe('good');
    expect(result.holeDist_m).toBeCloseTo(10);
    expect(result.endDist_m).toBeCloseTo(10);
    expect(result.angleThresholdsDeg?.on).toBeLessThan(1);
    expect(result.lateralMiss_cm).toBeCloseTo(0);
    expect(result.aimAdjust_cm).toBeCloseTo(0);
  });

  it('reports signed angle and aim suggestion', () => {
    const hole = { x: 0, y: 4 };
    const rightMiss = evaluatePutt({ startPx: start, endPx: polar(4, 2), holePx: hole });
    expect(Math.sign(rightMiss.signedAngleDeg)).toBe(1);
    expect(rightMiss.lateralMiss_cm).toBeGreaterThan(0);
    expect(rightMiss.aimAdjust_cm).toBeLessThan(0);

    const leftMiss = evaluatePutt({ startPx: start, endPx: polar(4, -2), holePx: hole });
    expect(Math.sign(leftMiss.signedAngleDeg)).toBe(-1);
    expect(leftMiss.lateralMiss_cm).toBeLessThan(0);
    expect(leftMiss.aimAdjust_cm).toBeGreaterThan(0);
  });
});

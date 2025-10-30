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

  it('classifies angle boundaries', () => {
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
  });
});

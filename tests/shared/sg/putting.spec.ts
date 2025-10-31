import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PUTTING_BASELINE_POINTS,
  PUTTING_BASELINE_MAX_DISTANCE,
  PUTTING_BASELINE_MIN_DISTANCE,
  loadDefaultPuttingBaseline,
} from '../../../shared/sg/baseline';
import {
  InvalidPuttSequenceError,
  holePuttingSG,
  type PuttEvent,
} from '../../../shared/sg/putting';

describe('loadDefaultPuttingBaseline', () => {
  it('is monotone and clamps to the supported domain', () => {
    const baseline = loadDefaultPuttingBaseline();
    const startValue = baseline(PUTTING_BASELINE_MIN_DISTANCE);
    expect(startValue).toBeCloseTo(DEFAULT_PUTTING_BASELINE_POINTS[0].expectedStrokes, 8);

    let previous = startValue;
    for (let distance = PUTTING_BASELINE_MIN_DISTANCE; distance <= PUTTING_BASELINE_MAX_DISTANCE; distance += 0.1) {
      const value = baseline(distance);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = value;
    }

    const below = baseline(PUTTING_BASELINE_MIN_DISTANCE - 5);
    expect(below).toBeCloseTo(startValue, 8);

    const above = baseline(PUTTING_BASELINE_MAX_DISTANCE + 5);
    const lastPoint = DEFAULT_PUTTING_BASELINE_POINTS[DEFAULT_PUTTING_BASELINE_POINTS.length - 1];
    expect(above).toBeCloseTo(lastPoint.expectedStrokes, 8);
  });
});

describe('holePuttingSG', () => {
  const baseline = loadDefaultPuttingBaseline();

  it('returns zero result for empty input', () => {
    expect(holePuttingSG([], baseline)).toEqual({
      total: 0,
      perPutt: [],
      baseline: { start: [], end: [] },
    });
  });

  it('computes SG for a single holed putt', () => {
    const events: PuttEvent[] = [{ start_m: 2, end_m: 0, holed: true }];
    const result = holePuttingSG(events, baseline);
    const expectedStart = baseline(2);
    const expectedEnd = baseline(0);
    const expectedSg = expectedStart - 1 - expectedEnd;

    expect(result.total).toBeCloseTo(expectedSg, 8);
    expect(result.perPutt).toHaveLength(1);
    expect(result.perPutt[0]).toBeCloseTo(expectedSg, 8);
    expect(result.baseline.start[0]).toBeCloseTo(expectedStart, 8);
    expect(result.baseline.end[0]).toBeCloseTo(expectedEnd, 8);
  });

  it('computes SG for a multi-putt sequence', () => {
    const events: PuttEvent[] = [
      { start_m: 3.5, end_m: 0.8, holed: false },
      { start_m: 0.8, end_m: 0, holed: true },
    ];
    const result = holePuttingSG(events, baseline);
    const sg1 = baseline(3.5) - 1 - baseline(0.8);
    const sg2 = baseline(0.8) - 1 - baseline(0);

    expect(result.perPutt[0]).toBeCloseTo(sg1, 8);
    expect(result.perPutt[1]).toBeCloseTo(sg2, 8);
    expect(result.total).toBeCloseTo(sg1 + sg2, 8);
  });

  it('rejects invalid sequences', () => {
    expect(() =>
      holePuttingSG(
        [
          { start_m: 0.5, end_m: 0.8, holed: false },
          { start_m: 0.8, end_m: 0, holed: true },
        ],
        baseline,
      ),
    ).toThrow(InvalidPuttSequenceError);

    expect(() => holePuttingSG([{ start_m: 2, end_m: 0.5, holed: false }], baseline)).toThrow(
      InvalidPuttSequenceError,
    );

    expect(() => holePuttingSG([{ start_m: 1.5, end_m: 0.2, holed: true }], baseline)).toThrow(
      InvalidPuttSequenceError,
    );
  });
});

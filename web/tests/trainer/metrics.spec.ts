import { describe, expect, it } from 'vitest';
import { computeGolden6 } from '../../../shared/trainer/metrics';

describe('computeGolden6', () => {
  function findMetric(metrics: ReturnType<typeof computeGolden6>, key: string) {
    const metric = metrics.find((entry) => entry.key === key);
    if (!metric) {
      throw new Error(`Metric ${key} not found`);
    }
    return metric;
  }

  it('classifies start line thresholds', () => {
    const good = computeGolden6({ startDeg: 0.8 });
    expect(findMetric(good, 'startLine').quality).toBe('good');

    const ok = computeGolden6({ startDeg: 2.3 });
    expect(findMetric(ok, 'startLine').quality).toBe('ok');

    const poor = computeGolden6({ startDeg: 3.1 });
    expect(findMetric(poor, 'startLine').quality).toBe('poor');
  });

  it('uses tempo windows around 3:1', () => {
    const fast = computeGolden6({ tempoRatio: 2.5 });
    expect(findMetric(fast, 'tempo').quality).toBe('good');

    const fringe = computeGolden6({ tempoRatio: 3.7 });
    expect(findMetric(fringe, 'tempo').quality).toBe('ok');

    const off = computeGolden6({ tempoRatio: 4.2 });
    expect(findMetric(off, 'tempo').quality).toBe('poor');
  });

  it('derives dyn loft delta from club baseline', () => {
    const midIron = computeGolden6({ club: '7i', launchDeg: 30 });
    const dynMetric = findMetric(midIron, 'dynLoftProxy');
    expect(dynMetric.value).toBeCloseTo(-2, 1);
    expect(dynMetric.quality).toBe('good');

    const wedge = computeGolden6({ club: 'pw', launchDeg: 52 });
    const wedgeDyn = findMetric(wedge, 'dynLoftProxy');
    expect(wedgeDyn.value).toBeCloseTo(7, 1);
    expect(wedgeDyn.quality).toBe('poor');
  });
});

import { describe, expect, it } from 'vitest';

import { RecenterController, type Quality } from '../../../shared/arhud/recenter';
import { rad } from '../../../shared/arhud/angles';

describe('RecenterController', () => {
  it('locks within timeout when error converges', () => {
    const controller = new RecenterController();
    controller.start(0, 0);
    let now = 0;
    let status = controller.status;

    for (let i = 0; i < 90; i += 1) {
      now += 20;
      let errorDeg: number;
      if (i < 10) {
        errorDeg = 5;
      } else {
        const progress = (i - 10) / 80;
        errorDeg = 5 * (1 - Math.min(progress, 1));
      }
      status = controller.sample(now, rad(errorDeg));
    }

    expect(status.state).toBe('locked');
    expect(status.elapsedMs).toBeLessThanOrEqual(2000);
  });

  it('times out when error oscillates outside the threshold', () => {
    const controller = new RecenterController({ timeoutMs: 1500, stableMs: 400 });
    controller.start(0, 0);
    let now = 0;
    let status = controller.status;

    for (let i = 0; i < 200; i += 1) {
      now += 20;
      const error = i % 2 === 0 ? 5 : -5;
      status = controller.sample(now, rad(error));
    }

    expect(status.state).toBe('timeout');
    expect(status.elapsedMs).toBeGreaterThan(1500);
  });

  it('maps RMS error to quality bands', () => {
    const qualityForErrors = (errors: number[]): Quality => {
      const ctrl = new RecenterController({ stableMs: 1000 });
      ctrl.start(0, 0);
      let now = 0;
      let status = ctrl.status;
      for (const err of errors) {
        now += 100;
        status = ctrl.sample(now, rad(err));
      }
      return status.quality;
    };

    expect(qualityForErrors([0.1, 0.2, 0.3])).toBe('excellent');
    expect(qualityForErrors([1.1, 1.2, 1.0])).toBe('good');
    expect(qualityForErrors([2.4, 2.6, 2.5])).toBe('fair');
    expect(qualityForErrors([5, 4.5, 6])).toBe('poor');
  });

  it('resets stability window when drift exceeds the maximum', () => {
    const controller = new RecenterController({ stableMs: 200, timeoutMs: 2000, maxDriftDeg: 4 });
    controller.start(0, 0);
    let now = 0;

    controller.sample((now += 50), rad(1));
    controller.sample((now += 50), rad(1.5));
    controller.sample((now += 50), rad(5));
    const statusAfterDrift = controller.sample((now += 50), rad(1));
    expect(statusAfterDrift.state).toBe('seeking');

    const statusLocked = controller.sample((now += 250), rad(1));
    expect(statusLocked.state).toBe('locked');
    expect(statusLocked.elapsedMs).toBeGreaterThanOrEqual(400);
  });
});

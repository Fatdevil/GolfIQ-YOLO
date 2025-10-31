import { describe, expect, it } from 'vitest';

import { YawEkf } from '../../../shared/arhud/ekf';
import { rad } from '../../../shared/arhud/angles';

describe('YawEkf', () => {
  it('learns gyro bias for a constant heading', () => {
    const ekf = new YawEkf();
    ekf.reset(0);
    const biasTrue = rad(0.6); // 0.6°/s bias in radians per second
    const dt = 0.01;
    const iterations = 2000;

    for (let i = 0; i < iterations; i += 1) {
      ekf.predict(biasTrue, dt);
      if (i % 2 === 0) {
        ekf.update(0);
      }
    }

    expect(Math.abs(ekf.bias - biasTrue)).toBeLessThan(1e-3);
    expect(Math.abs(ekf.yaw)).toBeLessThan(rad(0.5));
  });

  it('downweights low-quality magnetometer measurements', () => {
    const ekf = new YawEkf();
    ekf.reset(0);
    const dt = 0.02;
    const total = 300;

    for (let i = 0; i < total; i += 1) {
      ekf.predict(0, dt);
      if (i === 120) {
        ekf.update(rad(120), 0.1);
      } else {
        ekf.update(0, 1);
      }
    }

    expect(Math.abs(ekf.yaw)).toBeLessThan(rad(3));
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ShotSenseService } from '../ShotSenseService';

describe('ShotSenseService sample rate adaptation', () => {
  let originalDev: unknown;

  beforeEach(() => {
    originalDev = (globalThis as any).__DEV__;
    (globalThis as any).__DEV__ = false;
  });

  afterEach(() => {
    if (originalDev === undefined) {
      delete (globalThis as any).__DEV__;
    } else {
      (globalThis as any).__DEV__ = originalDev;
    }
  });

  const mkBatch = (hz: number) => ({
    v: 1 as const,
    hz,
    t0: Date.now(),
    frames: [],
  });

  it('adapts detector hz when batches change rate', () => {
    const service = new ShotSenseService();

    (service as any).ensureDetectorHz(50);
    expect((service as any).currentHz).toBe(50);

    (service as any).ensureDetectorHz(100);
    expect((service as any).currentHz).toBe(100);
  });

  it('ignores non-finite hz values', () => {
    const service = new ShotSenseService();

    (service as any).ensureDetectorHz(undefined);
    expect((service as any).currentHz).toBe(80);

    service.pushIMUBatch(mkBatch(NaN));
    expect((service as any).currentHz).toBe(80);
  });
});

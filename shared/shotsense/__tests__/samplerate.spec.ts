import { describe, expect, it } from 'vitest';

import { ShotDetector, msToSamples } from '../detector';

describe('ShotDetector sample rate adaptation', () => {
  it('recomputes windows when sampleHz changes', () => {
    const detector = new ShotDetector({
      sampleHz: 100,
      minSwingWindow_ms: 300,
      debounce_ms: 2000,
    });

    const before = (detector as any).minSwingWinSamples;
    detector.setSampleHz(50);
    const after = (detector as any).minSwingWinSamples;

    expect(after).toBeLessThan(before);
    expect(msToSamples(300, 50)).toBe(after);
  });
});

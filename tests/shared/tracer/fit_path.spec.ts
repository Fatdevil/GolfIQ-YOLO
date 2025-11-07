import { describe, it, expect } from 'vitest';

import { fitTracerPath } from '../../../shared/tracer/fit_path';

describe('fitTracerPath', () => {
  it('marks raw data as non-estimated', () => {
    const fit = fitTracerPath({
      raw: [
        [0, 0],
        [0.5, 0.4],
        [1, 0],
      ],
    });
    expect(fit).toBeTruthy();
    expect(fit!.source).toBe('raw');
    expect(fit!.estimated).toBe(false);
  });

  it('marks ballistic synthesis as estimated', () => {
    const fit = fitTracerPath({
      raw: null,
      carry: 180,
      apex: 32,
    });
    expect(fit).toBeTruthy();
    expect(fit!.source).toBe('ballistic');
    expect(fit!.estimated).toBe(true);
  });

  it('falls back to fit source when no data provided', () => {
    const fit = fitTracerPath({
      raw: null,
      carry: 0,
      apex: null,
    });
    expect(fit).toBeTruthy();
    expect(fit!.source).toBe('fit');
    expect(fit!.estimated).toBe(true);
  });
});

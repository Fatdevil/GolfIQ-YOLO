import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isSGFeatureEnabled } from '@web/sg/feature';

describe('isSGFeatureEnabled', () => {
  beforeEach(() => {
    vi.unstubAllEnvs?.();
  });

  afterEach(() => {
    vi.unstubAllEnvs?.();
  });

  it('defaults to false when missing/blank', () => {
    vi.stubEnv?.('VITE_FEATURE_SG', undefined as any);
    expect(isSGFeatureEnabled()).toBe(false);
    vi.stubEnv?.('VITE_FEATURE_SG', '');
    expect(isSGFeatureEnabled()).toBe(false);
  });

  it('enables only on explicit truthy', () => {
    for (const value of ['1', 'true', 'on', 'yes', 'enable']) {
      vi.stubEnv?.('VITE_FEATURE_SG', value);
      expect(isSGFeatureEnabled()).toBe(true);
    }
  });

  it('stays off on explicit falsy', () => {
    for (const value of ['0', 'false', 'off', 'no', 'disable']) {
      vi.stubEnv?.('VITE_FEATURE_SG', value);
      expect(isSGFeatureEnabled()).toBe(false);
    }
  });
});

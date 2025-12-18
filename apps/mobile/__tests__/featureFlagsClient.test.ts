import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  loadFeatureFlags,
  __resetFeatureFlagsForTests,
} from '@app/featureFlags/featureFlagsClient';
import {
  clearCachedFeatureFlags,
  readCachedFeatureFlags,
  writeCachedFeatureFlags,
} from '@app/featureFlags/featureFlagsStorage';
import { apiFetch, ApiError } from '@app/api/client';
import { isPracticeGrowthV1Enabled, __resetPracticeGrowthV1FlagCacheForTests } from '@shared/featureFlags/practiceGrowthV1';
import { isRoundFlowV2Enabled, __resetRoundFlowV2FlagCacheForTests } from '@shared/featureFlags/roundFlowV2';
import { setTelemetryEmitter } from '@app/telemetry';

vi.mock('@app/api/client', () => {
  class MockApiError extends Error {
    status?: number;
    constructor(message?: string, status?: number) {
      super(message);
      this.status = status;
    }
  }

  return {
    apiFetch: vi.fn(),
    ApiError: MockApiError,
  };
});

const mockedApiFetch = apiFetch as unknown as Mock;

describe('featureFlagsClient', () => {
  beforeEach(async () => {
    mockedApiFetch.mockReset?.();
    __resetFeatureFlagsForTests();
    __resetPracticeGrowthV1FlagCacheForTests();
    __resetRoundFlowV2FlagCacheForTests();
    setTelemetryEmitter(null);
    delete process.env.MOBILE_FEATURE_PRACTICE_GROWTH_V1;
    delete process.env.MOBILE_FEATURE_ROUND_FLOW_V2;
    await Promise.all([
      clearCachedFeatureFlags(),
      clearCachedFeatureFlags('user-a'),
      clearCachedFeatureFlags('user-b'),
    ]);
  });

  it('uses remote flags when the API succeeds', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      version: 1,
      flags: {
        practiceGrowthV1: { enabled: true, rolloutPct: 10, source: 'rollout' },
        roundFlowV2: { enabled: true, rolloutPct: 50, source: 'rollout' },
      },
    });

    await loadFeatureFlags({ userId: 'user-a' });

    expect(isPracticeGrowthV1Enabled(false)).toBe(true);
    expect(isRoundFlowV2Enabled(false)).toBe(true);
  });

  it('falls back to cached flags when the API fails', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      version: 1,
      flags: {
        practiceGrowthV1: { enabled: false, rolloutPct: 5, source: 'rollout' },
        roundFlowV2: { enabled: true, rolloutPct: 100, source: 'rollout' },
      },
    });
    await loadFeatureFlags({ userId: 'user-a' });

    __resetFeatureFlagsForTests();
    __resetPracticeGrowthV1FlagCacheForTests();
    __resetRoundFlowV2FlagCacheForTests();

    mockedApiFetch.mockRejectedValueOnce(new ApiError('offline'));
    await loadFeatureFlags({ userId: 'user-a' });

    expect(isPracticeGrowthV1Enabled(true)).toBe(false);
    expect(isRoundFlowV2Enabled(false)).toBe(true);
  });

  it('falls back to env/local defaults when both API and cache are unavailable', async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError('not found', 404));
    await loadFeatureFlags({ userId: 'user-a' });

    expect(isPracticeGrowthV1Enabled(true)).toBe(true);
    expect(isRoundFlowV2Enabled(false)).toBe(false);
  });

  it('emits a single exposure event per session', async () => {
    const emitter = vi.fn();
    setTelemetryEmitter(emitter);

    mockedApiFetch.mockResolvedValue({
      version: 1,
      flags: {
        practiceGrowthV1: { enabled: true, rolloutPct: 10, source: 'rollout' },
        roundFlowV2: { enabled: false, rolloutPct: 0, source: 'rollout' },
      },
    });

    await loadFeatureFlags({ userId: 'user-a' });
    await loadFeatureFlags({ userId: 'user-a' });

    expect(emitter).toHaveBeenCalledTimes(1);
    expect(emitter).toHaveBeenCalledWith(
      'feature_flags_loaded',
      expect.objectContaining({
        practiceGrowthV1_enabled: true,
        roundFlowV2_enabled: false,
      }),
    );
  });

  it('scopes cached feature flags per user id', async () => {
    const payload = {
      version: 1,
      flags: {
        practiceGrowthV1: { enabled: true, rolloutPct: 50, source: 'cache' },
      },
    } as const;

    await writeCachedFeatureFlags(payload, 'user-a');

    expect(await readCachedFeatureFlags('user-b')).toBeNull();
    expect(await readCachedFeatureFlags()).toBeNull();
    expect(await readCachedFeatureFlags('user-a')).toEqual(payload);
  });

  it('resets remote flags on user change when offline with no cache', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      version: 1,
      flags: {
        practiceGrowthV1: { enabled: true, rolloutPct: 10, source: 'rollout' },
        roundFlowV2: { enabled: true, rolloutPct: 20, source: 'rollout' },
      },
    });
    await loadFeatureFlags({ userId: 'user-a' });

    process.env.MOBILE_FEATURE_PRACTICE_GROWTH_V1 = 'false';
    process.env.MOBILE_FEATURE_ROUND_FLOW_V2 = 'false';

    mockedApiFetch.mockRejectedValueOnce(new ApiError('offline'));
    await loadFeatureFlags({ userId: 'user-b' });

    expect(isPracticeGrowthV1Enabled(true)).toBe(false);
    expect(isRoundFlowV2Enabled(false)).toBe(false);
  });

  it('uses per-user cached flags after account switch when remote fails', async () => {
    const userBCache = {
      version: 1,
      flags: {
        practiceGrowthV1: { enabled: false, rolloutPct: 0, source: 'cache' },
        roundFlowV2: { enabled: true, rolloutPct: 100, source: 'cache' },
      },
    } as const;

    await writeCachedFeatureFlags(userBCache, 'user-b');

    mockedApiFetch.mockResolvedValueOnce({
      version: 1,
      flags: {
        practiceGrowthV1: { enabled: true, rolloutPct: 10, source: 'rollout' },
        roundFlowV2: { enabled: true, rolloutPct: 20, source: 'rollout' },
      },
    });
    await loadFeatureFlags({ userId: 'user-a' });

    mockedApiFetch.mockRejectedValueOnce(new ApiError('offline'));
    await loadFeatureFlags({ userId: 'user-b' });

    expect(isPracticeGrowthV1Enabled(true)).toBe(false);
    expect(isRoundFlowV2Enabled(false)).toBe(true);
  });
});

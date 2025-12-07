import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchBagStats } from '@app/api/bagStatsClient';
import { apiFetch } from '@app/api/client';
import {
  isBagStatsFresh,
  loadCachedBagStats,
  saveBagStatsToCache,
  type CachedBagStats,
} from '@app/storage/bagStatsStorage';

vi.mock('@app/api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('@app/storage/bagStatsStorage', () => ({
  isBagStatsFresh: vi.fn(),
  loadCachedBagStats: vi.fn(),
  saveBagStatsToCache: vi.fn().mockResolvedValue(undefined),
}));

const mockApiFetch = vi.mocked(apiFetch);
const mockLoadCache = vi.mocked(loadCachedBagStats);
const mockSaveCache = vi.mocked(saveBagStatsToCache);
const mockIsFresh = vi.mocked(isBagStatsFresh);

const sampleStats = {
  '7i': { clubId: '7i', meanDistanceM: 150, sampleCount: 6 },
};

describe('bagStatsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('caches successful fetches', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleStats as any);

    const result = await fetchBagStats();

    expect(result).toEqual(sampleStats);
    expect(mockSaveCache).toHaveBeenCalledWith(sampleStats);
  });

  it('falls back to fresh cache when fetch fails', async () => {
    const cached: CachedBagStats = { payload: sampleStats, fetchedAt: Date.now() };
    mockApiFetch.mockRejectedValueOnce(new Error('offline'));
    mockLoadCache.mockResolvedValueOnce(cached);
    mockIsFresh.mockReturnValue(true);

    const result = await fetchBagStats();

    expect(result).toEqual(sampleStats);
    expect(mockLoadCache).toHaveBeenCalled();
  });

  it('propagates errors when cache is stale or missing', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('unavailable'));
    mockLoadCache.mockResolvedValueOnce({ payload: sampleStats, fetchedAt: 0 });
    mockIsFresh.mockReturnValue(false);

    await expect(fetchBagStats()).rejects.toThrow('unavailable');

    mockLoadCache.mockResolvedValueOnce(null);
    await expect(fetchBagStats()).rejects.toThrow();
  });
});

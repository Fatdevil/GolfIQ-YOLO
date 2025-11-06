import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/arhud/bundle_client', () => ({
  getBundle: vi.fn(),
  getIndex: vi.fn(),
  getLastBundleFetchMeta: vi.fn(),
  isBundleCached: vi.fn(),
  listCachedBundleIds: vi.fn(),
  overrideBundleTtl: vi.fn(),
  removeCachedBundle: vi.fn(),
}));

import {
  getBundle,
  getIndex,
  getLastBundleFetchMeta,
  isBundleCached,
  listCachedBundleIds,
  overrideBundleTtl,
  removeCachedBundle,
} from '@shared/arhud/bundle_client';
import { planPrefetch, pruneBundles, runPrefetch } from '@shared/arhud/prefetch';

const mockedGetIndex = vi.mocked(getIndex);
const mockedGetBundle = vi.mocked(getBundle);
const mockedGetLastMeta = vi.mocked(getLastBundleFetchMeta);
const mockedIsCached = vi.mocked(isBundleCached);
const mockedListCached = vi.mocked(listCachedBundleIds);
const mockedOverrideTtl = vi.mocked(overrideBundleTtl);
const mockedRemove = vi.mocked(removeCachedBundle);

describe('prefetch planner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plans around last course and nearest neighbours', async () => {
    mockedGetIndex.mockResolvedValue([
      { courseId: 'alpha', bbox: [0, 0, 0, 0] },
      { courseId: 'bravo', bbox: [0, 0, 0, 0] },
      { courseId: 'charlie', bbox: [0, 0, 0, 0] },
      { courseId: 'delta', bbox: [0, 0, 0, 0] },
    ]);

    const plan = await planPrefetch({
      lastCourseId: 'alpha',
      nearby: [
        { courseId: 'delta', dist_km: 4 },
        { courseId: 'charlie', dist_km: 2 },
        { courseId: 'bravo', dist_km: 1 },
      ],
    });

    expect(plan.courseIds).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('runs prefetch and reports downloaded vs skipped', async () => {
    mockedIsCached.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockedGetBundle.mockResolvedValueOnce({} as unknown as any).mockResolvedValueOnce({} as unknown as any);
    mockedGetLastMeta
      .mockReturnValueOnce({ fromCache: false } as any)
      .mockReturnValueOnce({ fromCache: true } as any);
    mockedOverrideTtl.mockResolvedValue(true);

    const report = await runPrefetch({ courseIds: ['alpha', 'bravo'], ttlSec: 7200 });

    expect(mockedGetBundle).toHaveBeenCalledTimes(2);
    expect(mockedOverrideTtl).toHaveBeenCalledWith('alpha', 7200);
    expect(report.downloaded).toEqual(['alpha']);
    expect(report.skipped).toEqual(['bravo']);
    expect(report.failed).toEqual([]);
  });

  it('prunes cached bundles except keep set', async () => {
    mockedListCached.mockResolvedValue(['alpha', 'bravo', 'charlie']);
    mockedRemove.mockResolvedValue();

    const removed = await pruneBundles(['alpha', 'charlie']);

    expect(mockedRemove).toHaveBeenCalledTimes(1);
    expect(mockedRemove).toHaveBeenCalledWith('bravo');
    expect(removed).toEqual(['bravo']);
  });
});

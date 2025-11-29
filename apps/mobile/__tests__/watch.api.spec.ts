import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWatchStatus, requestWatchPairCode } from '@app/api/watch';

const originalEnv = { ...process.env };

describe('watch api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env = { ...originalEnv, MOBILE_API_BASE: 'https://api.test' };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it('requests pair code and normalizes expiry', async () => {
    const expTs = Math.floor(Date.now() / 1000) + 120;
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ code: '654321', expTs }),
    } as any);

    const result = await requestWatchPairCode('mem-1');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.test/api/watch/pair/code?memberId=mem-1',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.code).toBe('654321');
    expect(result.expiresAt).toBe(new Date(expTs * 1000).toISOString());
  });

  it('fetches watch status for member', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ paired: true, lastSeenAt: '2024-01-01T00:00:00.000Z' }),
    } as any);

    const result = await fetchWatchStatus('mem-9');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.test/api/watch/devices/status?memberId=mem-9',
      expect.any(Object),
    );
    expect(result.paired).toBe(true);
    expect(result.lastSeenAt).toBe('2024-01-01T00:00:00.000Z');
  });
});

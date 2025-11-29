import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from '@app/api/client';

const originalEnv = { ...process.env };

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it('calls API with base URL and API key header', async () => {
    process.env.MOBILE_API_BASE = 'https://example.test';
    process.env.MOBILE_API_KEY = 'secret';
    const responseBody = { ok: true };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => responseBody,
    } as any);

    const result = await apiFetch<{ ok: boolean }>('/api/profile/player');

    expect(result).toEqual(responseBody);
    expect(fetch).toHaveBeenCalledWith('https://example.test/api/profile/player', {
      headers: expect.objectContaining({
        Accept: 'application/json',
        'x-api-key': 'secret',
      }),
    });
  });

  it('throws ApiError on non-OK responses', async () => {
    process.env.MOBILE_API_BASE = 'https://example.test';
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    } as any);

    const promise = apiFetch('/api/access/plan');

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      status: 503,
      message: 'service unavailable',
    });
  });
});

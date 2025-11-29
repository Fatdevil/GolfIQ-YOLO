import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { syncHoleHud, type HudSyncContext } from '@app/watch/HudSyncService';

const originalEnv = { ...process.env };

describe('HudSyncService', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    process.env = { ...originalEnv, MOBILE_API_BASE: 'https://api.test' };
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    warnSpy.mockRestore();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  const baseCtx: HudSyncContext = {
    memberId: 'mem-1',
    runId: 'run-1',
    courseId: 'course-1',
    courseName: 'Pebble',
    teeName: 'Blue',
    holes: 18,
    currentHole: 3,
    par: 5,
    strokeIndex: 7,
    lengthMeters: 480,
  };

  it('posts quickround sync payload with hole draft', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ deviceId: 'dev-1', synced: true }),
    } as any);

    await syncHoleHud(baseCtx);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.test/api/watch/quickround/sync',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.hole).toBe(3);
    expect(body.memberId).toBe('mem-1');
    expect(body.hud.par).toBe(5);
    expect(body.hud.toGreen_m).toBe(480);
  });

  it('no-ops when runId is missing', async () => {
    await syncHoleHud({ ...baseCtx, runId: undefined });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('suppresses client errors', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'not paired',
    } as any);

    await syncHoleHud(baseCtx);

    expect(warnSpy).toHaveBeenCalled();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlayerOverlay } from '@web/player/PlayerOverlay';
import { ShotList } from '@web/features/runs/ShotList';
import { __testing } from '@web/sg/hooks';

vi.mock('@web/features/clips/Player', () => ({
  ClipPlayer: ({ clipId }: { clipId: string }) => (
    <div data-testid="clip-player">overlay-player-{clipId}</div>
  ),
}));

vi.mock('@web/media/useSignedVideoSource', () => ({
  useSignedVideoSource: (rawUrl: string | null) => ({
    url: rawUrl,
    path: rawUrl ? '/signed.m3u8' : null,
    signed: Boolean(rawUrl),
    exp: null,
    loading: false,
    error: null,
  }),
}));

const runId = 'run-watch';

const sgPayload = {
  run_id: runId,
  sg_total: 0.4,
  holes: [
    {
      hole: 1,
      sg_total: 0.4,
      shots: [
        { hole: 1, shot: 1, sg_delta: 0.4 },
      ],
    },
  ],
};

const anchorsPayload = [
  {
    run_id: runId,
    hole: 1,
    shot: 1,
    clip_id: 'clip-2',
    t_start_ms: 9876,
    t_end_ms: 12000,
    version: 1,
    created_ts: Date.now() - 5000,
    updated_ts: Date.now() - 1000,
  },
];

describe('ShotList integration with PlayerOverlay', () => {
  const originalFetch = global.fetch;
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv?.('VITE_FEATURE_SG', '1');
    __testing.clearCache();
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/sg/runs/') && url.endsWith('/anchors')) {
        return Promise.resolve(new Response(JSON.stringify(anchorsPayload), { status: 200 }));
      }
      if (url.includes('/api/sg/runs/')) {
        return Promise.resolve(new Response(JSON.stringify(sgPayload), { status: 200 }));
      }
      if (url.includes('/api/clips/clip-2')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: 'clip-2', videoUrl: 'https://cdn.example.com/clip-2.m3u8', anchors: [9.876] }),
            { status: 200 },
          ),
        );
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs?.();
    fetchSpy.mockReset();
    global.fetch = originalFetch;
  });

  it('watch opens overlay and does not push to unknown route', async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');

    render(
      <>
        <PlayerOverlay />
        <ShotList runId={runId} shots={[{ hole: 1, shot: 1, clipId: 'clip-2', hidden: false, visibility: 'public' }]} />
      </>,
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^watch$/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /clip player/i })).toBeTruthy();
    });
    const player = await screen.findByTestId('clip-player');
    expect(player.textContent).toContain('overlay-player-clip-2');
    expect(pushSpy).not.toHaveBeenCalled();

    pushSpy.mockRestore();
  });
});


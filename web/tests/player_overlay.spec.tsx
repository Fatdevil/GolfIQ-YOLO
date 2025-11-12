import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlayerOverlay } from '@web/player/PlayerOverlay';

vi.mock('@web/features/clips/Player', () => ({
  ClipPlayer: ({ clipId }: { clipId: string }) => (
    <div data-testid="clip-player">mock-player-{clipId}</div>
  ),
}));

vi.mock('@web/media/useSignedVideoSource', () => ({
  useSignedVideoSource: (rawUrl: string | null) => ({
    url: rawUrl,
    path: rawUrl ? '/signed.m3u8' : null,
    signed: Boolean(rawUrl),
    exp: null,
    loading: false,
    error: rawUrl ? null : 'missing_url',
  }),
}));

describe('PlayerOverlay', () => {
  const originalFetch = global.fetch;
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/api/clips/clip-123')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: 'clip-123', videoUrl: 'https://cdn.example.com/clip-123.m3u8', anchors: [2.5] }),
            { status: 200 },
          ),
        );
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    fetchSpy.mockReset();
    global.fetch = originalFetch;
  });

  it('opens overlay and renders Clip player on player:open', async () => {
    render(<PlayerOverlay />);

    window.dispatchEvent(new CustomEvent('player:open', { detail: { clipId: 'clip-123', tMs: 5000 } }));

    const dialog = await screen.findByRole('dialog', { name: /clip player/i });
    expect(dialog).toBeTruthy();
    const player = await screen.findByTestId('clip-player');
    expect(player.textContent).toContain('mock-player-clip-123');
    expect(fetchSpy).toHaveBeenCalledWith('/api/clips/clip-123', expect.any(Object));
  });
});


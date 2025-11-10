import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ClipModal } from '@web/features/clips/ClipModal';
import type { ShotClip } from '@web/features/clips/types';
import { EventSessionContext } from '@web/session/eventSession';

describe('media signing integration', () => {
  const baseClip: ShotClip = {
    id: 'clip-123',
    video_url: '/hls/clip-123/master.m3u8',
  };

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requests a signed URL before rendering video playback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        url: 'https://cdn.example.com/hls/clip-123/master.m3u8?exp=1&sig=abc',
        exp: 1,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <EventSessionContext.Provider value={{ role: 'spectator', memberId: 'viewer', safe: false }}>
        <ClipModal clip={baseClip} />
      </EventSessionContext.Provider>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/media/sign?path=%2Fhls%2Fclip-123%2Fmaster.m3u8');
    });

    await waitFor(() => {
      const video = container.querySelector('video');
      expect(video).not.toBeNull();
      expect(video?.getAttribute('src')).toEqual(
        'https://cdn.example.com/hls/clip-123/master.m3u8?exp=1&sig=abc',
      );
    });
  });

  it('falls back to the unsigned URL when signing fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <EventSessionContext.Provider value={{ role: 'spectator', memberId: 'viewer', safe: false }}>
        <ClipModal clip={{ ...baseClip, id: 'clip-unsigned' }} />
      </EventSessionContext.Provider>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      const video = container.querySelector('video');
      expect(video).not.toBeNull();
      expect(video?.getAttribute('src')).toEqual('/hls/clip-123/master.m3u8');
    });
  });
});

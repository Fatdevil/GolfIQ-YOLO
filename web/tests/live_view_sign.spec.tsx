import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as livePlaybackModule from '@web/features/live/useLivePlayback';
import { EventSessionContext, DEFAULT_SESSION } from '@web/session/eventSession';
import * as liveApi from '@web/features/live/api';
import * as mediaSign from '@web/media/sign';
vi.mock('@web/features/live/api');
vi.mock('@web/media/sign');

const getLiveStatus = vi.mocked(liveApi.getLiveStatus);
const getSignedPlaybackUrl = vi.mocked(mediaSign.getSignedPlaybackUrl);

function withSession(children: ReactNode) {
  return <EventSessionContext.Provider value={DEFAULT_SESSION}>{children}</EventSessionContext.Provider>;
}

function SessionWrapper({ children }: { children: ReactNode }) {
  return withSession(children);
}

beforeEach(() => {
  getLiveStatus.mockReset();
  getSignedPlaybackUrl.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('useLivePlayback hook', () => {
  it('fetches status and signs playback when token provided', async () => {
    getLiveStatus.mockResolvedValue({
      running: true,
      hlsPath: '/hls/mock/event-5/index.m3u8',
      startedAt: new Date().toISOString(),
      viewers: 0,
    });
    getSignedPlaybackUrl.mockResolvedValue({
      url: 'https://signed/hls.m3u8',
      signed: true,
      path: '/hls/mock/event-5/index.m3u8',
      exp: null,
    });

    const { result } = renderHook(
      () => livePlaybackModule.useLivePlayback('event-5', { token: 'viewer-token', pollMs: 50, immediate: true }),
      {
        wrapper: SessionWrapper,
      },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getLiveStatus).toHaveBeenCalledWith('event-5', 'viewer-token');
    expect(getSignedPlaybackUrl).toHaveBeenCalledWith('/hls/mock/event-5/index.m3u8');
    expect(result.current.videoUrl).toBe('https://signed/hls.m3u8');
    expect(result.current.signed).toBe(true);
  });

  it('does not sign without token', async () => {
    getLiveStatus.mockResolvedValue({
      running: true,
      hlsPath: '/hls/mock/event-5/index.m3u8',
      startedAt: new Date().toISOString(),
      viewers: 0,
    });

    const { result } = renderHook(
      () => livePlaybackModule.useLivePlayback('event-5', { pollMs: 50, immediate: true }),
      {
        wrapper: SessionWrapper,
      },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(getLiveStatus).toHaveBeenCalledWith('event-5', undefined);
    expect(getSignedPlaybackUrl).not.toHaveBeenCalled();
    expect(result.current.videoUrl).toBeNull();
  });
});


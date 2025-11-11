import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import EventLiveViewerPage from '@web/pages/events/[id]/live-view';
import { EventSessionContext, DEFAULT_SESSION } from '@web/session/eventSession';
import * as livePlaybackModule from '@web/features/live/useLivePlayback';
import * as liveApi from '@web/features/live/api';
import * as api from '@web/api';

vi.mock('@web/features/live/api');

const exchangeInvite = vi.mocked(liveApi.exchangeViewerInvite);
const postTelemetry = vi.spyOn(api, 'postTelemetryEvent');

function renderViewer(initialEntry: string) {
  return render(
    <EventSessionContext.Provider value={DEFAULT_SESSION}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/events/:id/live-view" element={<EventLiveViewerPage />} />
        </Routes>
      </MemoryRouter>
    </EventSessionContext.Provider>,
  );
}

describe('Event live viewer invite flow', () => {
  const playbackSpy = vi.spyOn(livePlaybackModule, 'useLivePlayback');

  beforeEach(() => {
    playbackSpy.mockReset();
    postTelemetry.mockClear();
    postTelemetry.mockResolvedValue(undefined);
    exchangeInvite.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('exchanges invite for token and renders playback', async () => {
    exchangeInvite.mockResolvedValue({ token: 'viewer-token', exp: Date.now() / 1000 + 600 });
    playbackSpy.mockReturnValue({
      running: true,
      hlsPath: '/hls/mock/event-55/index.m3u8',
      videoUrl: 'https://signed/event-55.m3u8',
      loading: false,
      signed: true,
      token: 'viewer-token',
      error: null,
    });

    renderViewer('/events/event-55/live-view?invite=invite-code');

    await waitFor(() => {
      expect(exchangeInvite).toHaveBeenCalledWith('event-55', 'invite-code');
    });

    await waitFor(() => {
      expect(playbackSpy).toHaveBeenCalledWith('event-55', { token: 'viewer-token' });
    });

    await waitFor(() => {
      expect(postTelemetry).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'live.invite.exchange.ok', eventId: 'event-55' }),
      );
    });

    expect(await screen.findByTestId('live-viewer-video')).toBeTruthy();
  });
});

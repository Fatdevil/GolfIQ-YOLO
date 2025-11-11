import { cleanup, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import EventLiveViewerPage from '@web/pages/events/[id]/live-view';
import { EventSessionContext, DEFAULT_SESSION } from '@web/session/eventSession';
import * as livePlaybackModule from '@web/features/live/useLivePlayback';
import * as api from '@web/api';

const telemetrySpy = vi.spyOn(api, 'postTelemetryEvent').mockResolvedValue(undefined);

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

describe('Event live viewer telemetry', () => {
  const playbackSpy = vi.spyOn(livePlaybackModule, 'useLivePlayback');

  beforeEach(() => {
    telemetrySpy.mockClear();
    playbackSpy.mockReset();
    playbackSpy.mockReturnValue({
      running: true,
      hlsPath: '/hls/mock/event-11/index.m3u8',
      videoUrl: 'https://signed/event-11.m3u8',
      loading: false,
      signed: true,
      token: 'viewer-token',
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('emits live.viewer_open when viewer token is present', async () => {
    renderViewer('/events/event-11/live-view?token=viewer-token');

    expect(playbackSpy).toHaveBeenCalledWith('event-11', { token: 'viewer-token' });

    await waitFor(() => {
      expect(telemetrySpy).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'live.viewer_open', eventId: 'event-11' }),
      );
    });
  });

  afterAll(() => {
    playbackSpy.mockRestore();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { LiveStateResponse } from '@web/features/live/api';
import LiveViewerPage from '@web/pages/events/LiveViewerPage';
import * as liveApi from '@web/features/live/api';
import * as liveTelemetry from '@web/metrics/liveTelemetry';
import type HlsMockClass from './mocks/hls';

vi.mock('@web/features/live/api');
vi.mock('@web/metrics/liveTelemetry', () => ({
  emitLiveViewStart: vi.fn().mockResolvedValue(undefined),
  emitLiveViewEnd: vi.fn().mockResolvedValue(undefined),
  emitLiveViewReconnect: vi.fn().mockResolvedValue(undefined),
  emitLiveViewError: vi.fn().mockResolvedValue(undefined),
}));

const getLiveState = vi.mocked(liveApi.getLiveState);
let playSpy: MockInstance<HTMLMediaElement['play']>;
let canPlaySpy: MockInstance<HTMLMediaElement['canPlayType']>;

function createLiveState(overrides: Partial<LiveStateResponse> = {}): LiveStateResponse {
  return {
    isLive: true,
    viewerUrl: 'https://cdn.example/live/master.m3u8',
    startedTs: Date.now(),
    updatedTs: Date.now(),
    streamId: 'stream-1',
    latencyMode: 'll-hls',
    ...overrides,
  };
}

function renderViewer(responses: LiveStateResponse[]): void {
  let callIndex = 0;
  getLiveState.mockImplementation(async () => {
    const index = Math.min(callIndex, responses.length - 1);
    callIndex += 1;
    return responses[index];
  });

  render(
    <MemoryRouter initialEntries={['/events/event-1/live?stallMs=10&pollMs=20&backoffMs=15']}>
      <Routes>
        <Route path="/events/:id/live" element={<LiveViewerPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getLiveState.mockReset();
  vi.mocked(liveTelemetry.emitLiveViewStart).mockClear();
  vi.mocked(liveTelemetry.emitLiveViewReconnect).mockClear();
  playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play');
  playSpy.mockResolvedValue(undefined as unknown as void);
  canPlaySpy = vi.spyOn(HTMLMediaElement.prototype, 'canPlayType');
  canPlaySpy.mockReturnValue('probably');
});

afterEach(() => {
  cleanup();
  playSpy.mockRestore();
  canPlaySpy.mockRestore();
});

describe('Live viewer states', () => {
  it('transitions from connecting to playing when playback starts', async () => {
    renderViewer([createLiveState()]);

    await waitFor(() => {
      expect(getLiveState).toHaveBeenCalled();
    });

    const video = await screen.findByTestId('live-viewer-video');
    fireEvent(video, new Event('playing'));

    await waitFor(() => {
      expect(screen.getByText('Stream is live.')).toBeTruthy();
    });
  });

  it('shows reconnecting state when playback stalls', async () => {
    renderViewer([createLiveState()]);

    await waitFor(() => {
      expect(getLiveState).toHaveBeenCalled();
    });

    const video = await screen.findByTestId('live-viewer-video');
    fireEvent(video, new Event('playing'));

    await waitFor(() => {
      expect(screen.getByText('Stream is live.')).toBeTruthy();
    });

    fireEvent(video, new Event('waiting'));

    await waitFor(() => {
      expect(screen.getByTestId('live-viewer-overlay').textContent).toContain('Reconnecting (1/3)…');
    });
  });

  it('refreshes manifest when a 403 manifest error occurs', async () => {
    canPlaySpy.mockReturnValue('');
    const responses = [
      createLiveState({ viewerUrl: 'https://cdn.example/live/master.m3u8' }),
      createLiveState({ viewerUrl: 'https://cdn.example/live/master-new.m3u8', updatedTs: Date.now() + 1000 }),
    ];

    const hlsModule = await import('hls.js');
    const HlsMock = hlsModule.default as unknown as typeof HlsMockClass;
    HlsMock.instances = [];

    renderViewer(responses);

    await waitFor(() => {
      expect(HlsMock.instances[0]?.loadSource).toHaveBeenCalledWith('https://cdn.example/live/master.m3u8');
    });

    HlsMock.instances[0]?.emit('error', { fatal: true, response: { code: 403 }, type: 'networkError' });

    await waitFor(() => {
      expect(getLiveState).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      const loadedNewManifest = HlsMock.instances.some((instance) =>
        instance.loadSource.mock.calls.some(([url]) => url === 'https://cdn.example/live/master-new.m3u8'),
      );
      expect(loadedNewManifest).toBe(true);
    });
  });

  it('shows preparing state when live heartbeat expires', async () => {
    renderViewer([
      createLiveState(),
      createLiveState({ isLive: false, viewerUrl: null }),
    ]);

    await waitFor(() => {
      expect(getLiveState).toHaveBeenCalled();
    });

    await screen.findByTestId('live-viewer-video');
    await waitFor(() => {
      expect(getLiveState).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByTestId('live-viewer-overlay').textContent).toContain('Preparing stream…');
    });
  });
});

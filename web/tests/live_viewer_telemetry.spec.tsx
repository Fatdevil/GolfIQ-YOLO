import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import type { LiveStateResponse } from '@web/features/live/api';
import LiveViewerPage from '@web/pages/events/LiveViewerPage';
import * as liveApi from '@web/features/live/api';
import * as liveTelemetry from '@web/metrics/liveTelemetry';

vi.mock('@web/features/live/api');
vi.mock('@web/metrics/liveTelemetry', () => ({
  emitLiveViewStart: vi.fn().mockResolvedValue(undefined),
  emitLiveViewEnd: vi.fn().mockResolvedValue(undefined),
  emitLiveViewReconnect: vi.fn().mockResolvedValue(undefined),
  emitLiveViewError: vi.fn().mockResolvedValue(undefined),
}));

const getLiveState = vi.mocked(liveApi.getLiveState);
const telemetry = vi.mocked(liveTelemetry);
let playSpy: MockInstance<HTMLMediaElement['play']>;
let canPlaySpy: MockInstance<HTMLMediaElement['canPlayType']>;

function createLiveState(overrides: Partial<LiveStateResponse> = {}): LiveStateResponse {
  return {
    isLive: true,
    viewerUrl: 'https://cdn.example/live/master.m3u8',
    startedTs: Date.now(),
    updatedTs: Date.now(),
    streamId: 'stream-telemetry',
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
    <MemoryRouter initialEntries={['/events/event-telemetry/live?stallMs=10&pollMs=20&backoffMs=15']}>
      <Routes>
        <Route path="/events/:id/live" element={<LiveViewerPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getLiveState.mockReset();
  telemetry.emitLiveViewStart.mockClear();
  telemetry.emitLiveViewReconnect.mockClear();
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

describe('Live viewer telemetry', () => {
  it('emits live.view.start with play_start_ms', async () => {
    renderViewer([createLiveState()]);

    await waitFor(() => {
      expect(getLiveState).toHaveBeenCalled();
    });

    const video = await screen.findByTestId('live-viewer-video');
    fireEvent(video, new Event('playing'));

    await waitFor(() => {
      expect(telemetry.emitLiveViewStart).toHaveBeenCalled();
    });

    const payload = telemetry.emitLiveViewStart.mock.calls[0][0];
    expect(payload.eventId).toBe('event-telemetry');
    expect(payload.streamId).toBe('stream-telemetry');
    expect(payload.play_start_ms).toBeGreaterThanOrEqual(0);
  });

  it('emits live.view.reconnect when playback stalls', async () => {
    renderViewer([createLiveState()]);

    await waitFor(() => {
      expect(getLiveState).toHaveBeenCalled();
    });

    const video = await screen.findByTestId('live-viewer-video');
    fireEvent(video, new Event('waiting'));

    await waitFor(() => {
      expect(telemetry.emitLiveViewReconnect).toHaveBeenCalledWith({
        eventId: 'event-telemetry',
        attempt: 1,
        reason: 'stall_timeout',
      });
    });
  });
});

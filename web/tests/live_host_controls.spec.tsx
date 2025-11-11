import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import EventLiveHostPage from '@web/pages/events/[id]/live-host';
import { EventSessionContext, DEFAULT_SESSION } from '@web/session/eventSession';
import * as liveApi from '@web/features/live/api';

vi.mock('@web/features/live/api');

const getLiveStatus = vi.mocked(liveApi.getLiveStatus);
const startLive = vi.mocked(liveApi.startLive);
const stopLive = vi.mocked(liveApi.stopLive);
const mintViewerToken = vi.mocked(liveApi.mintViewerToken);

const adminSession = { ...DEFAULT_SESSION, role: 'admin' as const, memberId: 'member-1', safe: false };
let clipboardSpy: ReturnType<typeof vi.fn>;

function renderPage(session = adminSession) {
  return render(
    <EventSessionContext.Provider value={session}>
      <MemoryRouter initialEntries={["/events/event-9/live-host"]}>
        <Routes>
          <Route path="/events/:id/live-host" element={<EventLiveHostPage />} />
        </Routes>
      </MemoryRouter>
    </EventSessionContext.Provider>,
  );
}

beforeEach(() => {
  getLiveStatus.mockResolvedValue({ running: false });
  startLive.mockResolvedValue({ hlsPath: '/hls/mock/event-9/index.m3u8', startedAt: new Date().toISOString() });
  stopLive.mockResolvedValue({ stopped: true });
  mintViewerToken.mockResolvedValue({ token: 'viewer-token', exp: Math.floor(Date.now() / 1000) + 600 });
  clipboardSpy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: clipboardSpy,
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (navigator as any).clipboard;
  cleanup();
});

describe('Event live host controls', () => {
  it('starts and stops live stream as admin', async () => {
    renderPage();

    await screen.findByText('Live stream is stopped');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Start Stream' }));

    await waitFor(() => {
      expect(startLive).toHaveBeenCalledWith('event-9', adminSession.memberId);
    });

    await user.click(screen.getByRole('button', { name: 'Stop Stream' }));

    await waitFor(() => {
      expect(stopLive).toHaveBeenCalledWith('event-9', adminSession.memberId);
    });
  });

  it('mints viewer link and copies to clipboard', async () => {
    renderPage();

    await screen.findByRole('button', { name: 'Generate Viewer Link' });

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Start Stream' }));
    await waitFor(() => expect(startLive).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Generate Viewer Link' }));

    await waitFor(() => {
      expect(mintViewerToken).toHaveBeenCalledWith('event-9', adminSession.memberId);
    });

    await waitFor(() => {
      expect(screen.getByText(/Copied to clipboard/)).toBeTruthy();
    });

    expect(screen.getByText(/Viewer link/)).toBeTruthy();
  });
});

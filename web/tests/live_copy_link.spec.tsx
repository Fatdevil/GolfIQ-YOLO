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
const createViewerLink = vi.mocked(liveApi.createViewerLink);

const adminSession = { ...DEFAULT_SESSION, role: 'admin' as const, memberId: 'member-42', safe: false };

function renderHost(session = adminSession) {
  return render(
    <EventSessionContext.Provider value={session}>
      <MemoryRouter initialEntries={["/events/event-42/live-host"]}>
        <Routes>
          <Route path="/events/:id/live-host" element={<EventLiveHostPage />} />
        </Routes>
      </MemoryRouter>
    </EventSessionContext.Provider>,
  );
}

describe('Live host viewer link copy', () => {
  let clipboardSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getLiveStatus.mockResolvedValue({ running: false, startedAt: null, viewers: 0, hlsPath: null });
    startLive.mockResolvedValue({ hlsPath: '/hls/mock/event-42/index.m3u8', startedAt: new Date().toISOString() });
    stopLive.mockResolvedValue({ stopped: true });
    createViewerLink.mockResolvedValue({ url: 'https://app.example/events/event-42/live-view?token=abc' });
  clipboardSpy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: {
      writeText: clipboardSpy,
    } as unknown as Clipboard,
  });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (navigator as any).clipboard;
    cleanup();
  });

  it('calls API and copies viewer link to clipboard', async () => {
    renderHost();

    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Start Stream' }));

    await waitFor(() => {
      expect(startLive).toHaveBeenCalledWith('event-42', adminSession.memberId);
    });

    await user.click(screen.getByRole('button', { name: 'Copy Viewer Link' }));

    await waitFor(() => {
      expect(createViewerLink).toHaveBeenCalledWith('event-42', adminSession.memberId);
    });

    expect(await screen.findByText('Viewer link copied!')).toBeTruthy();
  });
});

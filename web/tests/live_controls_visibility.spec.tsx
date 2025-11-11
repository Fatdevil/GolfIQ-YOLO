import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import EventLiveHostPage from '@web/pages/events/[id]/live-host';
import { DEFAULT_SESSION, EventSessionContext } from '@web/session/eventSession';
import * as liveApi from '@web/features/live/api';

vi.mock('@web/features/live/api');

const getLiveStatus = vi.mocked(liveApi.getLiveStatus);

function renderHost(session = DEFAULT_SESSION) {
  return render(
    <EventSessionContext.Provider value={session}>
      <MemoryRouter initialEntries={["/events/event-1/live-host"]}>
        <Routes>
          <Route path="/events/:id/live-host" element={<EventLiveHostPage />} />
        </Routes>
      </MemoryRouter>
    </EventSessionContext.Provider>,
  );
}

describe('Event live controls gating', () => {
  beforeEach(() => {
    getLiveStatus.mockResolvedValue({ running: false, startedAt: null, viewers: 0, hlsPath: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('shows controls for admin when safe=false', async () => {
    renderHost({ ...DEFAULT_SESSION, role: 'admin', memberId: 'host-1', safe: false });

    expect(await screen.findByRole('button', { name: 'Start Stream' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop Stream' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy Viewer Link' })).toBeTruthy();
  });

  it('hides controls when admin session is safe', async () => {
    renderHost({ ...DEFAULT_SESSION, role: 'admin', memberId: 'host-1', safe: true });

    await screen.findByText('Live controls are disabled in tournament safe mode.');
    expect(screen.queryByRole('button', { name: 'Start Stream' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop Stream' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy Viewer Link' })).toBeNull();
  });

  it('shows spectator notice when session is not admin', async () => {
    renderHost(DEFAULT_SESSION);

    expect(await screen.findByText('Admin access required to manage live streams.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start Stream' })).toBeNull();
  });
});

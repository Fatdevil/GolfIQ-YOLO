import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import EventClipsAdminQueue from '@web/pages/events/[id]/admin/clips';
import { EventSessionContext } from '@web/session/eventSession';
import * as clipsApi from '@web/features/clips/api';
import * as api from '@web/api';

vi.mock('@web/features/clips/api');

const listClipCommentaries = vi.mocked(clipsApi.listClipCommentaries);
const getClipCommentary = vi.mocked(clipsApi.getClipCommentary);
const postClipCommentaryPlay = vi.mocked(clipsApi.postClipCommentaryPlay);

const adminSession = { role: 'admin' as const, memberId: 'member-7', safe: false };

function renderPage() {
  return render(
    <EventSessionContext.Provider value={adminSession}>
      <MemoryRouter initialEntries={['/events/event-9/admin/clips']}>
        <Routes>
          <Route path="/events/:id/admin/clips" element={<EventClipsAdminQueue />} />
        </Routes>
      </MemoryRouter>
    </EventSessionContext.Provider>,
  );
}

beforeEach(() => {
  listClipCommentaries.mockResolvedValue([
    {
      clipId: 'clip-ready',
      status: 'ready',
      title: 'Ready clip',
      summary: 'Highlight summary',
      ttsUrl: null,
      updatedTs: new Date('2024-03-01T12:00:00Z').toISOString(),
    },
    {
      clipId: 'clip-running',
      status: 'running',
      title: null,
      summary: null,
      ttsUrl: null,
      updatedTs: new Date('2024-03-01T12:01:00Z').toISOString(),
    },
  ]);
  getClipCommentary.mockResolvedValue({
    clipId: 'clip-ready',
    status: 'ready',
    title: 'Ready clip',
    summary: 'Highlight summary',
    ttsUrl: null,
    updatedTs: new Date('2024-03-01T12:00:00Z').toISOString(),
  });
  postClipCommentaryPlay.mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('Event clips admin queue actions', () => {
  it('requests commentary when status ready', async () => {
    const postSpy = vi.spyOn(api, 'postClipCommentary').mockResolvedValue({
      title: 'New title',
      summary: 'New summary',
      ttsUrl: null,
    });

    renderPage();

    await screen.findByText('Ready clip');

    const user = userEvent.setup({ delay: null });
    const [requestReady] = screen.getAllByRole('button', { name: 'Request' });
    await user.click(requestReady);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('clip-ready', adminSession.memberId);
    });
  });

  it('does not request commentary when status running', async () => {
    const postSpy = vi.spyOn(api, 'postClipCommentary').mockResolvedValue({
      title: 'unused',
      summary: 'unused',
      ttsUrl: null,
    });

    renderPage();

    await screen.findByText('Ready clip');

    const user = userEvent.setup({ delay: null });
    const buttons = screen.getAllByRole('button', { name: 'Request' });
    await user.click(buttons[1]);

    expect(postSpy).not.toHaveBeenCalledWith('clip-running', expect.anything());
  });
});

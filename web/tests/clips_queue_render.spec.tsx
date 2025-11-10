import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import EventClipsAdminQueue from '@web/pages/events/[id]/admin/clips';
import { EventSessionContext } from '@web/session/eventSession';
import * as clipsApi from '@web/features/clips/api';

vi.mock('@web/features/clips/api');

const listClipCommentaries = vi.mocked(clipsApi.listClipCommentaries);
const getClipCommentary = vi.mocked(clipsApi.getClipCommentary);
const postClipCommentaryPlay = vi.mocked(clipsApi.postClipCommentaryPlay);

const adminSession = { role: 'admin' as const, memberId: 'host-1', safe: false };

function renderPage() {
  return render(
    <EventSessionContext.Provider value={adminSession}>
      <MemoryRouter initialEntries={['/events/event-1/admin/clips']}>
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
      clipId: 'clip-1',
      status: 'queued',
      title: null,
      summary: null,
      ttsUrl: null,
      updatedTs: new Date('2024-01-01T10:00:00Z').toISOString(),
    },
    {
      clipId: 'clip-2',
      status: 'ready',
      title: 'Clutch finish',
      summary: 'Birdie on 18 clinches the match.',
      ttsUrl: null,
      updatedTs: new Date('2024-01-01T10:05:00Z').toISOString(),
    },
  ]);
  getClipCommentary.mockResolvedValue({
    clipId: 'clip-1',
    status: 'queued',
    title: null,
    summary: null,
    ttsUrl: null,
    updatedTs: new Date('2024-01-01T10:00:00Z').toISOString(),
  });
  postClipCommentaryPlay.mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('Event clips admin queue', () => {
  it('renders clip statuses and details', async () => {
    renderPage();

    await screen.findByText('Clips');
    await screen.findByText('Queued');
    await screen.findByText('Ready');

    await waitFor(() => {
      expect(listClipCommentaries).toHaveBeenCalledWith('event-1', {
        memberId: adminSession.memberId,
        signal: expect.any(AbortSignal),
      });
    });
  });
});

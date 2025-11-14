import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AxiosError, AxiosResponse } from 'axios';

import EventClipsAdminQueue from '@web/pages/events/[id]/admin/clips';
import { EventSessionContext } from '@web/session/eventSession';
import * as clipsApi from '@web/features/clips/api';
import * as api from '@web/api';

vi.mock('@web/features/clips/api');

const listClipCommentaries = vi.mocked(clipsApi.listClipCommentaries);
const getClipCommentary = vi.mocked(clipsApi.getClipCommentary);
const postClipCommentaryPlay = vi.mocked(clipsApi.postClipCommentaryPlay);

const session = { role: 'admin' as const, memberId: 'admin-1', safe: false, tournamentSafe: false };

function renderPage() {
  return render(
    <EventSessionContext.Provider value={session}>
      <MemoryRouter initialEntries={['/events/event-safe/admin/clips']}>
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
      clipId: 'clip-safe',
      status: 'ready',
      title: 'Ready clip',
      summary: 'Highlight',
      ttsUrl: null,
      updatedTs: new Date('2024-04-02T08:00:00Z').toISOString(),
    },
  ]);
  getClipCommentary.mockResolvedValue({
    clipId: 'clip-safe',
    status: 'ready',
    title: 'Ready clip',
    summary: 'Highlight',
    ttsUrl: null,
    updatedTs: new Date('2024-04-02T08:00:00Z').toISOString(),
  });
  postClipCommentaryPlay.mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('Event clips admin queue safe handling', () => {
  it('shows safe banner when request returns 423', async () => {
    const lockedError = {
      isAxiosError: true,
      response: { status: 423 } as AxiosResponse,
      message: 'Locked',
      name: 'AxiosError',
      toJSON: () => ({}),
    } as AxiosError;

    const postSpy = vi
      .spyOn(api, 'postClipCommentary')
      .mockRejectedValue(lockedError);

    renderPage();

    await screen.findByText('Ready clip');

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: 'Request' }));

    await screen.findByText('Tournament-safe: commentary disabled');

    expect(postSpy).toHaveBeenCalledWith('clip-safe', session.memberId);
  });
});

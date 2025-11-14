import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import EventClipModerationPage from '@web/pages/events/[id]/admin/moderation';
import { EventSessionContext } from '@web/session/eventSession';
import * as moderationApi from '@web/features/clips/moderationApi';

vi.mock('@web/features/clips/moderationApi');

const listModerationQueue = vi.mocked(moderationApi.listModerationQueue);
const moderateClip = vi.mocked(moderationApi.moderateClip);

const adminSession = { role: 'admin' as const, memberId: 'host-1', safe: false, tournamentSafe: false };

function renderPage() {
  return render(
    <EventSessionContext.Provider value={adminSession}>
      <MemoryRouter initialEntries={['/events/event-1/admin/moderation']}>
        <Routes>
          <Route path="/events/:id/admin/moderation" element={<EventClipModerationPage />} />
        </Routes>
      </MemoryRouter>
    </EventSessionContext.Provider>,
  );
}

beforeEach(() => {
  listModerationQueue.mockResolvedValue([
    {
      clipId: 'clip-1',
      hidden: false,
      visibility: 'public',
      reports: 2,
      updatedTs: new Date('2024-02-01T10:00:00Z').toISOString(),
    },
  ]);
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('Event clip moderation actions', () => {
  it('calls hide action and removes clip from queue', async () => {
    moderateClip.mockResolvedValue({
      clipId: 'clip-1',
      hidden: true,
      visibility: 'public',
      reports: 0,
      updatedTs: new Date('2024-02-01T10:05:00Z').toISOString(),
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('clip-1');
    await user.click(screen.getByRole('button', { name: 'Hide' }));

    expect(moderateClip).toHaveBeenCalledWith('clip-1', { action: 'hide' }, adminSession.memberId);

    await waitFor(() => {
      expect(screen.queryByText('clip-1')).toBeNull();
    });
  });

  it('updates visibility when a new option is selected', async () => {
    listModerationQueue.mockResolvedValueOnce([
      {
        clipId: 'clip-2',
        hidden: false,
        visibility: 'public',
        reports: 1,
        updatedTs: new Date('2024-02-01T11:00:00Z').toISOString(),
      },
    ]);
    moderateClip.mockResolvedValue({
      clipId: 'clip-2',
      hidden: false,
      visibility: 'event',
      reports: 1,
      updatedTs: new Date('2024-02-01T11:05:00Z').toISOString(),
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('clip-2');
    await user.selectOptions(screen.getByDisplayValue('Public'), 'Event');

    expect(moderateClip).toHaveBeenCalledWith('clip-2', { action: 'set_visibility', visibility: 'event' }, adminSession.memberId);
    await screen.findByDisplayValue('Event');
  });

  it('calls unhide action for hidden clips', async () => {
    listModerationQueue.mockResolvedValueOnce([
      {
        clipId: 'clip-3',
        hidden: true,
        visibility: 'friends',
        reports: 1,
        updatedTs: new Date('2024-02-02T09:00:00Z').toISOString(),
      },
    ]);
    moderateClip.mockResolvedValue({
      clipId: 'clip-3',
      hidden: false,
      visibility: 'friends',
      reports: 1,
      updatedTs: new Date('2024-02-02T09:05:00Z').toISOString(),
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('clip-3');
    await user.click(screen.getByRole('button', { name: 'Unhide' }));

    expect(moderateClip).toHaveBeenCalledWith('clip-3', { action: 'unhide' }, adminSession.memberId);
    await screen.findByText('clip-3');
  });
});

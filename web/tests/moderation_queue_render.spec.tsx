import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import EventClipModerationPage from '@web/pages/events/[id]/admin/moderation';
import { EventSessionContext } from '@web/session/eventSession';
import * as moderationApi from '@web/features/clips/moderationApi';

vi.mock('@web/features/clips/moderationApi');

const listModerationQueue = vi.mocked(moderationApi.listModerationQueue);

const adminSession = { role: 'admin' as const, memberId: 'host-1', safe: false };

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

describe('Event clip moderation queue', () => {
  it('renders queue entries with visibility controls', async () => {
    renderPage();

    await screen.findByText('Clip moderation');
    await screen.findByText('clip-1');
    await screen.findByDisplayValue('Public');
  });
});

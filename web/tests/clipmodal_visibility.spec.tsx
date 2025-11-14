import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClipModal } from '@web/features/clips/ClipModal';
import type { ShotClip } from '@web/features/clips/types';
import { EventSessionContext } from '@web/session/eventSession';
import * as moderationApi from '@web/features/clips/moderationApi';

vi.mock('@web/features/clips/moderationApi');

const reportClip = vi.mocked(moderationApi.reportClip);

const baseClip: ShotClip = {
  id: 'clip-visibility',
  video_url: 'https://cdn.example.com/video.mp4',
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ClipModal visibility banners and reporting', () => {
  it('shows hidden banner when clip is moderated', () => {
    render(
      <EventSessionContext.Provider value={{ role: 'spectator', memberId: 'viewer-1', safe: false, tournamentSafe: false }}>
        <ClipModal clip={{ ...baseClip, hidden: true }} />
      </EventSessionContext.Provider>,
    );

    expect(screen.getByText('Hidden by moderation')).toBeTruthy();
  });

  it('shows not-visible banner for restricted visibility', () => {
    render(
      <EventSessionContext.Provider value={{ role: 'spectator', memberId: null, safe: false, tournamentSafe: false }}>
        <ClipModal clip={{ ...baseClip, visibility: 'event' }} />
      </EventSessionContext.Provider>,
    );

    expect(screen.getByText('Not visible to you')).toBeTruthy();
  });

  it('allows spectators to report a clip', async () => {
    reportClip.mockResolvedValue({
      id: 'report-1',
      clipId: 'clip-visibility',
      reason: 'user_report',
      status: 'open',
      ts: new Date('2024-02-10T10:00:00Z').toISOString(),
    });

    const user = userEvent.setup();
    render(
      <EventSessionContext.Provider value={{ role: 'spectator', memberId: 'viewer-5', safe: false, tournamentSafe: false }}>
        <ClipModal clip={baseClip} />
      </EventSessionContext.Provider>,
    );

    await user.click(screen.getByRole('button', { name: /report clip/i }));

    await waitFor(() => {
      expect(reportClip).toHaveBeenCalledWith('clip-visibility', {
        reason: 'user_report',
        reporter: 'viewer-5',
      });
    });

    await screen.findByRole('button', { name: /reported/i });
  });
});

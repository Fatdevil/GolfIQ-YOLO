import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosResponse } from 'axios';

import * as api from '@web/api';
import { ClipModal } from '@web/features/clips/ClipModal';
import type { ShotClip } from '@web/features/clips/types';
import { EventSessionContext } from '@web/session/eventSession';

const baseClip: ShotClip = {
  id: 'clip-safe',
  ai_title: undefined,
  ai_summary: undefined,
  video_url: 'https://cdn.example.com/video.mp4',
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Clip commentary safe guard', () => {
  it('hides admin request button and shows banner in safe mode', () => {
    render(
      <EventSessionContext.Provider value={{ role: 'admin', memberId: 'host-1', safe: true, tournamentSafe: true }}>
        <ClipModal clip={baseClip} />
      </EventSessionContext.Provider>,
    );

    expect(screen.queryByRole('button', { name: /request commentary/i })).toBeNull();
    expect(screen.getByText('Tournament-safe: commentary disabled')).toBeTruthy();
  });

  it('renders enabled request button for admin when not in safe mode', async () => {
    const user = userEvent.setup();
    const postSpy = vi
      .spyOn(api, 'postClipCommentary')
      .mockResolvedValue({ title: 'ok', summary: 'ok', ttsUrl: null });

    render(
      <EventSessionContext.Provider value={{ role: 'admin', memberId: 'member-7', safe: false, tournamentSafe: false }}>
        <ClipModal clip={baseClip} />
      </EventSessionContext.Provider>,
    );

    const btn = (await screen.findByRole('button', { name: /request commentary/i })) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);

    await user.click(btn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('clip-safe', 'member-7');
    });
  });

  it('does not render request button for spectators', () => {
    render(
      <EventSessionContext.Provider value={{ role: 'spectator', memberId: 'viewer-9', safe: false, tournamentSafe: false }}>
        <ClipModal clip={baseClip} />
      </EventSessionContext.Provider>,
    );

    expect(screen.queryByRole('button', { name: /request commentary/i })).toBeNull();
  });

  it('surfaces tournament-safe banner when server locks commentary', async () => {
    const user = userEvent.setup();
    const error = {
      isAxiosError: true,
      message: 'Locked',
      name: 'AxiosError',
      toJSON: () => ({}),
      response: { status: 423 } as AxiosResponse,
    } as AxiosError;
    const postSpy = vi
      .spyOn(api, 'postClipCommentary')
      .mockRejectedValue(error);

    render(
      <EventSessionContext.Provider value={{ role: 'admin', memberId: 'member-7', safe: false, tournamentSafe: false }}>
        <ClipModal clip={baseClip} />
      </EventSessionContext.Provider>,
    );

    await user.click(screen.getByRole('button', { name: /request commentary/i }));

    await waitFor(() => {
      expect(screen.getByText('Tournament-safe: commentary disabled')).toBeTruthy();
    });
    expect(postSpy).toHaveBeenCalledTimes(1);
  });
});

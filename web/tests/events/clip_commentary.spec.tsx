import axios from 'axios';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi, afterEach } from 'vitest';

import { postClipCommentary, API } from '@web/api';
import { ClipModal } from '@web/features/clips/ClipModal';
import type { ShotClip } from '@web/features/clips/types';
import { EventSessionProvider } from '@web/features/events/EventSessionContext';



afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

describe('postClipCommentary', () => {
  it('sends admin header when requesting commentary', async () => {
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { title: 'ok', summary: 'ok', ttsUrl: null },
    });

    await postClipCommentary('clip-42');

    expect(postSpy).toHaveBeenCalledWith(
      `${API}/events/clips/clip-42/commentary`,
      null,
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-event-role': 'admin' }),
      }),
    );

    postSpy.mockRestore();
  });
});

describe('ClipModal', () => {
  const baseClip: ShotClip = {
    id: 'clip-1',
    ai_title: 'Walk-off eagle',
    ai_summary: 'Linn holes a long putt to close out the match.',
    video_url: 'https://cdn.example.com/clip.mp4',
  };

  it('renders existing commentary when available', () => {
    render(
      <EventSessionProvider value={{ role: 'spectator', tournamentSafe: false, coachMode: false }}>
        <ClipModal clip={baseClip} />
      </EventSessionProvider>,
    );

    expect(screen.getByText('Walk-off eagle')).toBeTruthy();
    expect(screen.getByText(/holes a long putt/i)).toBeTruthy();
    expect(screen.queryByText('Request commentary')).toBeNull();
  });

  it('shows request button only for admin role', () => {
    render(
      <EventSessionProvider value={{ role: 'admin', tournamentSafe: false, coachMode: false }}>
        <ClipModal clip={{ ...baseClip, ai_title: undefined, ai_summary: undefined }} />
      </EventSessionProvider>,
    );

    expect(screen.getByText('Request commentary')).toBeTruthy();
  });

  it('requests commentary and refetches clip data', async () => {
    const user = userEvent.setup();
    const clipWithRefetch: ShotClip = { ...baseClip, ai_title: undefined, ai_summary: undefined };
    const postSpy = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { title: 'Birdie buzz', summary: 'Updated summary', ttsUrl: null } });

    function Wrapper(): JSX.Element {
      const [clip, setClip] = useState<ShotClip>(clipWithRefetch);
      return (
        <EventSessionProvider value={{ role: 'admin', tournamentSafe: false, coachMode: false }}>
          <ClipModal
            clip={clip}
            onRefetch={() =>
              setClip((prev) => ({
                ...(prev ?? clipWithRefetch),
                ai_title: 'Birdie buzz',
                ai_summary: 'Updated summary',
                ai_tts_url: null,
              }))
            }
          />
        </EventSessionProvider>
      );
    }

    render(<Wrapper />);

    await user.click(screen.getByText('Request commentary'));

    await waitFor(() => {
      expect(screen.getByText('Birdie buzz')).toBeTruthy();
      expect(screen.getByText('Updated summary')).toBeTruthy();
    });

    postSpy.mockRestore();
  });

  it('renders voice-over control when tts url available', () => {
    render(
      <EventSessionProvider value={{ role: 'admin', tournamentSafe: false, coachMode: false }}>
        <ClipModal clip={{ ...baseClip, ai_tts_url: 'https://cdn.example.com/tts.mp3' }} />
      </EventSessionProvider>,
    );

    expect(screen.getByText('Play voice-over')).toBeTruthy();
  });

  it('hides voice-over control when no url', () => {
    render(
      <EventSessionProvider value={{ role: 'admin', tournamentSafe: false, coachMode: false }}>
        <ClipModal clip={{ ...baseClip, ai_tts_url: undefined }} />
      </EventSessionProvider>,
    );

    expect(screen.queryByText('Play voice-over')).toBeNull();
  });
});

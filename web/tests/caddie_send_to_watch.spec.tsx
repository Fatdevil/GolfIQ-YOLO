import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CaddieTipPanel } from '@web/sg/CaddieTipPanel';
import { EventSessionContext } from '@web/session/eventSession';

vi.mock('@web/api', () => ({
  getApiKey: () => 'test-key',
}));

describe('CaddieTipPanel send to watch', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts the selected tip to the watch endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            playsLike_m: 152.3,
            club: '7i',
            reasoning: ['Target 150 m plays-like'],
            confidence: 0.93,
            silent: false,
            silent_reason: null,
          }),
      })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <EventSessionContext.Provider value={{ role: 'spectator', memberId: 'member-123', safe: true, tournamentSafe: false }}>
        <CaddieTipPanel runId="run-1" hole={5} shot={2} before_m={140} bearing_deg={10} />
      </EventSessionContext.Provider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /get advice/i }));
    await screen.findByText(/Target 150 m plays-like/i);

    await userEvent.click(screen.getByRole('button', { name: /send to watch/i }));

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, request] = fetchMock.mock.calls[1];
    expect(fetchMock.mock.calls[1][0]).toBe('/api/watch/member-123/tips');
    expect(request).toMatchObject({ method: 'POST' });
    expect((request as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-api-key': 'test-key',
    });

    const body = JSON.parse(String((request as RequestInit).body));
    expect(body).toMatchObject({
      tipId: 'run-run-1-h5-s2',
      club: '7i',
      playsLike_m: 152.3,
      shotRef: { runId: 'run-1', hole: 5, shot: 2 },
    });
    expect(body.title).toBe('H5 S2: 7i');
    expect(body.body).toContain('Target 150 m plays-like');
  });
});

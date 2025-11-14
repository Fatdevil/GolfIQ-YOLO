import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CaddieTipPanel } from '@web/sg/CaddieTipPanel';
import { DEFAULT_SESSION, EventSessionContext } from '@web/session/eventSession';

import { createAccessWrapper } from './test-helpers/access';

vi.mock('@web/api', () => ({
  getApiKey: () => 'test-key',
}));

describe('CaddieTipPanel confidence gate', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const baseProps = { runId: 'run-1', hole: 1, shot: 1, before_m: 140, bearing_deg: 0 };

  it('renders normal advice when silent=false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          playsLike_m: 149.8,
          club: '7i',
          reasoning: ['Target 150 m plays-like; 7i avg 148 m'],
          confidence: 0.91,
          silent: false,
          silent_reason: null,
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CaddieTipPanel {...baseProps} />, { wrapper: createAccessWrapper() });

    await userEvent.click(screen.getByRole('button', { name: /get advice/i }));

    const reasoning = await screen.findByText(/Target 150 m plays-like/i);
    expect(reasoning).toBeTruthy();
    expect(screen.getByText(/Plays-like/).textContent).toContain('Plays-like 150 m');
    expect(screen.getByText(/Club:/).textContent).toContain('7i');
    expect(screen.queryByText(/Caddie is quiet/i)).toBeNull();
  });

  it('shows quiet message for low confidence advice', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          playsLike_m: 189.3,
          club: '4i',
          reasoning: ['Wind head 3.00 m/s, cross no crosswind (2.10%)'],
          confidence: 0.4,
          silent: true,
          silent_reason: 'low_confidence',
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <EventSessionContext.Provider value={DEFAULT_SESSION}>
        <CaddieTipPanel {...baseProps} />
      </EventSessionContext.Provider>,
      { wrapper: createAccessWrapper() },
    );

    await userEvent.click(screen.getByRole('button', { name: /get advice/i }));

    expect(await screen.findByText('Caddie is quiet here – not enough data yet.')).toBeTruthy();
    expect(screen.queryByText(/Plays-like/)).toBeNull();
    expect(screen.queryByRole('button', { name: /send to watch/i })).toBeNull();
  });

  it('surfaces tournament messaging and badge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          playsLike_m: null,
          club: null,
          reasoning: [],
          confidence: 0.85,
          silent: true,
          silent_reason: 'tournament_safe',
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <EventSessionContext.Provider
        value={{ ...DEFAULT_SESSION, tournamentSafe: true, safe: true }}
      >
        <CaddieTipPanel {...baseProps} />
      </EventSessionContext.Provider>,
      { wrapper: createAccessWrapper() },
    );

    await userEvent.click(screen.getByRole('button', { name: /get advice/i }));

    expect(await screen.findByText('Tournament mode – advanced hints are disabled.')).toBeTruthy();
    expect(screen.getByText('Tournament mode')).toBeTruthy();
    expect(screen.queryByText(/Club:/)).toBeNull();
  });
});

import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpectatorBoardResponse } from '@web/api';

const emitEventsTvTick = vi.fn();
const emitEventsTvRotate = vi.fn();

vi.mock('@shared/events/telemetry', () => ({
  emitEventsTvTick: (...args: Parameters<typeof emitEventsTvTick>) => {
    emitEventsTvTick(...args);
  },
  emitEventsTvRotate: (...args: Parameters<typeof emitEventsTvRotate>) => {
    emitEventsTvRotate(...args);
  },
  emitEventsHostAction: vi.fn(),
  emitEventsResync: vi.fn(),
  emitEventsLiveTick: vi.fn(),
}));

const fetchSpectatorBoard = vi.fn<(eventId: string) => Promise<SpectatorBoardResponse>>();

vi.mock('@web/api', () => ({
  fetchSpectatorBoard: (...args: Parameters<typeof fetchSpectatorBoard>) => fetchSpectatorBoard(...args),
}));

// eslint-disable-next-line import/first
import TvBoard from '../../src/pages/events/[id]/tv';

const BASE_BOARD: SpectatorBoardResponse = {
  players: [
    { name: 'Player A', gross: 70, net: 68, thru: 18, hole: 18, status: 'finished' },
    { name: 'Player B', gross: 72, net: 70, thru: 18, hole: 18, status: 'finished' },
    { name: 'Player C', gross: 75, net: 71, thru: 18, hole: 18, status: 'finished' },
  ],
  updatedAt: new Date().toISOString(),
  grossNet: 'net',
  tvFlags: { showQrOverlay: false, autoRotateTop: false },
  participants: 3,
  spectators: 10,
};

describe('EventTvBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpectatorBoard.mockResolvedValue(BASE_BOARD);
  });

  const renderTv = () =>
    render(
      <MemoryRouter initialEntries={['/events/evt-1/tv']}>
        <Routes>
          <Route path="/events/:id/tv" element={<TvBoard />} />
        </Routes>
      </MemoryRouter>,
    );

  it('rotates between leaderboard and stats view when auto-rotate enabled', async () => {
    fetchSpectatorBoard.mockResolvedValue({
      ...BASE_BOARD,
      tvFlags: { showQrOverlay: false, autoRotateTop: true, rotateIntervalMs: 50 },
    });
    const view = renderTv();

    await waitFor(() => expect(fetchSpectatorBoard).toHaveBeenCalledWith('evt-1'));
    expect(screen.getByText(/Live Leaderboard/i)).toBeTruthy();
    expect(screen.getByText(/Player A/)).toBeTruthy();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    await waitFor(() => expect(screen.getByText(/Ball Flight Snapshot/i)).toBeTruthy());
    expect(emitEventsTvRotate).toHaveBeenCalled();
    view.unmount();
  });

  it('shows QR overlay when provided by board settings', async () => {
    fetchSpectatorBoard.mockResolvedValue({
      ...BASE_BOARD,
      tvFlags: { showQrOverlay: true, autoRotateTop: false },
      qrSvg: '<svg id="qr">test</svg>',
    });

    const view = renderTv();
    await waitFor(() => expect(fetchSpectatorBoard).toHaveBeenCalled());

    const qrContainer = await screen.findByText(/Scan to follow live/);
    expect(qrContainer).toBeTruthy();
    view.unmount();
  });

  it('stays on leaderboard when auto-rotate disabled', async () => {
    fetchSpectatorBoard.mockResolvedValue({
      ...BASE_BOARD,
      tvFlags: { showQrOverlay: false, autoRotateTop: false },
    });

    const view = renderTv();
    await waitFor(() => expect(fetchSpectatorBoard).toHaveBeenCalled());

    await waitFor(() => {
      const panels = screen.getAllByTestId('tv-stats-panel');
      expect(panels.every((panel: HTMLElement) => panel.className.includes('opacity-0'))).toBe(true);
      expect(panels.every((panel: HTMLElement) => panel.className.includes('pointer-events-none'))).toBe(true);
    });
    expect(emitEventsTvRotate).not.toHaveBeenCalled();
    view.unmount();
  });
});

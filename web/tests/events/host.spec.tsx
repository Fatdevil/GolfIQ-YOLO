import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HostStateResponse, UpdateEventSettingsBody } from '@web/api';

vi.mock('@shared/events/telemetry', () => ({
  emitEventsHostAction: vi.fn(),
}));

const fetchHostState = vi.fn<(eventId: string, memberId?: string) => Promise<HostStateResponse>>();
const postEventStart = vi.fn<(eventId: string, memberId?: string) => Promise<HostStateResponse>>();
const postEventPause = vi.fn<(eventId: string, memberId?: string) => Promise<HostStateResponse>>();
const postEventClose = vi.fn<(eventId: string, memberId?: string) => Promise<HostStateResponse>>();
const postEventRegenerateCode = vi.fn<(eventId: string, memberId?: string) => Promise<HostStateResponse>>();
const patchEventSettings = vi.fn<
  (eventId: string, body: UpdateEventSettingsBody, memberId?: string) => Promise<HostStateResponse>
>();

vi.mock('@web/api', () => ({
  fetchHostState: (...args: Parameters<typeof fetchHostState>) => fetchHostState(...args),
  postEventStart: (...args: Parameters<typeof postEventStart>) => postEventStart(...args),
  postEventPause: (...args: Parameters<typeof postEventPause>) => postEventPause(...args),
  postEventClose: (...args: Parameters<typeof postEventClose>) => postEventClose(...args),
  postEventRegenerateCode: (...args: Parameters<typeof postEventRegenerateCode>) => postEventRegenerateCode(...args),
  patchEventSettings: (...args: Parameters<typeof patchEventSettings>) => patchEventSettings(...args),
}));

// eslint-disable-next-line import/first
import HostPanel from '../../src/pages/events/[id]/host';

const BASE_STATE: HostStateResponse = {
  id: 'evt-1',
  name: 'Club Finals',
  status: 'pending',
  code: 'ABC1234',
  joinUrl: 'https://app.example.com/join/ABC1234',
  grossNet: 'net',
  tvFlags: { showQrOverlay: false, autoRotateTop: true },
  participants: 4,
  spectators: 6,
  qrSvg: '<svg>qr</svg>',
};

describe('EventHostPanel', () => {
  let currentState: HostStateResponse;

  const resetState = () =>
    (currentState = {
      ...BASE_STATE,
      tvFlags: { ...BASE_STATE.tvFlags },
    });

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    resetState();
    fetchHostState.mockImplementation(async () => currentState);
    postEventStart.mockImplementation(async () => {
      currentState = { ...currentState, status: 'live' };
      return currentState;
    });
    postEventPause.mockImplementation(async () => {
      currentState = { ...currentState, status: 'paused' };
      return currentState;
    });
    postEventClose.mockImplementation(async () => {
      currentState = { ...currentState, status: 'closed' };
      return currentState;
    });
    postEventRegenerateCode.mockImplementation(async () => {
      currentState = {
        ...currentState,
        code: 'XYZ9876',
        joinUrl: 'https://app.example.com/join/XYZ9876',
      };
      return currentState;
    });
    patchEventSettings.mockImplementation(async (_eventId, body: UpdateEventSettingsBody) => {
      const next: HostStateResponse = {
        ...currentState,
        ...(body.grossNet ? { grossNet: body.grossNet } : {}),
        ...(body.tvFlags
          ? {
              tvFlags: {
                ...currentState.tvFlags,
                ...body.tvFlags,
              },
            }
          : {}),
      };
      currentState = {
        ...next,
        tvFlags: { ...next.tvFlags },
      };
      return currentState;
    });
    vi.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000000');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderHost = () =>
    render(
      <MemoryRouter initialEntries={['/events/evt-1/host']}>
        <Routes>
          <Route path="/events/:id/host" element={<HostPanel />} />
        </Routes>
      </MemoryRouter>,
    );

  it('loads host state and performs start/pause/close actions', async () => {
    const user = userEvent.setup();
    renderHost();

    await waitFor(() => expect(fetchHostState).toHaveBeenCalledWith('evt-1', '00000000-0000-0000-0000-000000000000'));

    expect(screen.getByText(/Club Finals/i)).toBeTruthy();
    expect(screen.getByText(/PENDING/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Start event' }));
    await waitFor(() => expect(postEventStart).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/LIVE/i)).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Pause event' }));
    await waitFor(() => expect(postEventPause).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/PAUSED/i)).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Close event' }));
    await waitFor(() => expect(postEventClose).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/CLOSED/i)).toBeTruthy());
  });

  it('regenerates join code and toggles settings', async () => {
    const user = userEvent.setup();
    renderHost();

    await waitFor(() => expect(fetchHostState).toHaveBeenCalled());

    const regenButtons = screen.getAllByRole('button', { name: 'Regenerate join code' });
    await user.click(regenButtons[0]!);
    await waitFor(() => expect(postEventRegenerateCode).toHaveBeenCalled());

    const toggleGross = screen.getAllByRole('button', { name: /Showing Net/i });
    await user.click(toggleGross[0]!);
    await waitFor(() =>
      expect(patchEventSettings).toHaveBeenCalledWith(
        'evt-1',
        { grossNet: 'gross' },
        '00000000-0000-0000-0000-000000000000',
      ),
    );

    const qrToggle = screen.getAllByLabelText('Show QR on TV')[0]!;
    await user.click(qrToggle);
    await waitFor(() =>
      expect(patchEventSettings).toHaveBeenLastCalledWith(
        'evt-1',
        expect.objectContaining({
          tvFlags: expect.objectContaining({ showQrOverlay: true, autoRotateTop: true }),
        }),
        '00000000-0000-0000-0000-000000000000',
      ),
    );
  });
});

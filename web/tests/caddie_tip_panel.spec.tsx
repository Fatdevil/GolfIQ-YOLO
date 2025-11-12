import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CaddieTipPanel } from '@web/sg/CaddieTipPanel';

vi.mock('@web/api', () => ({
  getApiKey: () => 'test-key',
}));

describe('CaddieTipPanel', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requests advice and renders response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ playsLike_m: 152.3, club: '7i', reasoning: ['Target 150 m plays-like'] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CaddieTipPanel runId="run-1" hole={1} shot={2} before_m={140} bearing_deg={15} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /get advice/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/caddie/advise',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json', 'x-api-key': 'test-key' }),
      }),
    );

    await screen.findByText(/Target 150 m plays-like/i);
    expect(
      screen.getAllByText((content, element) => Boolean(element?.textContent?.includes('Club: 7i'))).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText((content, element) => Boolean(element?.textContent?.includes('Plays-like 152 m'))).length,
    ).toBeGreaterThan(0);
  });

  it('shows error when request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CaddieTipPanel runId="run-1" hole={1} shot={2} before_m={140} bearing_deg={0} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /get advice/i }));

    expect(await screen.findByText(/Error: advise failed/i)).toBeTruthy();
  });
});

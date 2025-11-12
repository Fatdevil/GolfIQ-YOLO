import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PairWatchDialog from '@web/watch/PairWatchDialog';

vi.mock('@web/api', async () => {
  const actual = await vi.importActual<typeof import('@web/api')>('@web/api');
  return {
    ...actual,
    API: 'http://localhost:9999',
    getApiKey: () => 'test-key',
  };
});

describe('PairWatchDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    import.meta.env.VITE_FEATURE_WATCH = '1';
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loads join code, shows countdown, and regenerates on demand', async () => {
    const baseTs = Math.floor(Date.now() / 1000);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ code: '654321', expTs: baseTs + 180 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ code: '111222', expTs: baseTs + 240 }),
      });

    vi.stubGlobal('fetch', fetchMock);

    render(<PairWatchDialog open memberId="member-1" onClose={() => {}} />);

    await screen.findByText('654321');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(requestUrl).toBe('http://localhost:9999/api/watch/pair/code?memberId=member-1');
    expect(requestInit).toMatchObject({ method: 'POST', headers: { 'x-api-key': 'test-key' } });

    expect(screen.getByText(/Expires in/i).textContent).toContain('180s');

    vi.advanceTimersByTime(2000);
    await waitFor(() => {
      expect(screen.getByText(/Expires in/i).textContent).toContain('178s');
    });

    await userEvent.click(screen.getByRole('button', { name: /generate new code/i }));

    await screen.findByText('111222');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

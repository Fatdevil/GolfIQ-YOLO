import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import * as apiModule from '@web/api';
import PairWatchDialog from '@web/watch/PairWatchDialog';

const BASE_DATE = new Date('2024-01-01T00:00:00Z');

describe('PairWatchDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_DATE);
    import.meta.env.VITE_FEATURE_WATCH = '1';
    vi.spyOn(apiModule, 'getApiKey').mockReturnValue('test-key');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads join code, shows countdown, and regenerates on demand', async () => {
    const baseTs = Math.floor(BASE_DATE.getTime() / 1000);
    const responses = [
      new Response(JSON.stringify({ code: '123456', expTs: baseTs + 120 }), { status: 200 }),
      new Response(JSON.stringify({ code: '654321', expTs: baseTs + 180 }), { status: 200 }),
    ];
    const pending: Array<(value: Response) => void> = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));

    vi.stubGlobal('fetch', fetchMock);

    render(<PairWatchDialog open memberId="member-1" onClose={() => {}} />);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const resolveInitial = pending.shift();
    expect(resolveInitial).toBeDefined();
    await act(async () => {
      resolveInitial?.(responses[0]);
      await Promise.resolve();
    });

    expect(screen.getByTestId('join-code').textContent).toContain('123456');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const fetchMockTyped = (globalThis.fetch as unknown as Mock);
    const firstCall = fetchMockTyped.mock.calls[0] as [RequestInfo | URL, RequestInit?];
    const firstUrl = String(firstCall[0]);
    const firstInit = (firstCall[1] ?? {}) as RequestInit;
    expect(firstUrl).toContain('/api/watch/pair/code?memberId=member-1');
    expect(firstInit).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        'x-api-key': 'test-key',
        'content-type': 'application/json',
      }),
    });

    const countdownBefore = screen.getByText(/Expires in/i).textContent ?? '';

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    const countdownAfter = screen.getByText(/Expires in/i).textContent ?? '';
    expect(countdownAfter).not.toBe(countdownBefore);

    fireEvent.click(screen.getByRole('button', { name: /generate new code/i }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = fetchMockTyped.mock.calls[1] as [RequestInfo | URL, RequestInit?];
    const secondUrl = String(secondCall[0]);
    expect(secondUrl).toContain('/api/watch/pair/code?memberId=member-1');
    const resolveNext = pending.shift();
    expect(resolveNext).toBeDefined();
    await act(async () => {
      resolveNext?.(responses[1]);
      await Promise.resolve();
    });

    expect(screen.getByTestId('join-code').textContent).toContain('654321');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10_000);
});

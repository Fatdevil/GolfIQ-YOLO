import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventContextProvider } from '@web/events/context';
import type { RunSG } from '@web/sg/hooks';
import { EventSGLeaderboard } from '@web/sg/EventSGLeaderboard';
import { __testing } from '@web/sg/hooks';

const runPayloads: Record<string, RunSG> = {
  'run-a': {
    run_id: 'run-a',
    sg_total: 3.5,
    holes: [
      { hole: 5, sg_total: 1.5, shots: [{ hole: 5, shot: 1, sg_delta: 1.5 }] },
      { hole: 12, sg_total: 2.0, shots: [{ hole: 12, shot: 1, sg_delta: 2.0 }] },
    ],
  },
  'run-b': {
    run_id: 'run-b',
    sg_total: -1.25,
    holes: [
      { hole: 3, sg_total: -0.5, shots: [{ hole: 3, shot: 1, sg_delta: -0.5 }] },
      { hole: 9, sg_total: -0.75, shots: [{ hole: 9, shot: 1, sg_delta: -0.75 }] },
    ],
  },
};

describe('EventSGLeaderboard', () => {
  const originalFetch = global.fetch;
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv?.('VITE_FEATURE_SG', '1');
    __testing.clearCache();
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const match = url.match(/\/api\/sg\/runs\/(.+?)(?:\/?$)/);
      if (match) {
        const runId = match[1];
        const body = runPayloads[runId];
        if (!body) {
          return Promise.resolve(new Response('not found', { status: 404 }));
        }
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs?.();
    global.fetch = originalFetch;
    fetchSpy.mockReset();
  });

  it('ranks runs by total strokes-gained and formats totals/thru', async () => {
    render(
      <EventContextProvider
        value={{
          eventId: 'event-1',
          members: [
            { id: 'player-a', name: 'Alice Apex' },
            { id: 'player-b', name: 'Bob Birdie' },
          ],
          runs: [
            { memberId: 'player-a', runId: 'run-a' },
            { memberId: 'player-b', runId: 'run-b' },
          ],
          isClipVisible: () => true,
        }}
      >
        <EventSGLeaderboard />
      </EventContextProvider>,
    );

    const table = await screen.findByRole('table');

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);

    const firstRowCells = within(rows[0]).getAllByRole('cell');
    expect(firstRowCells[1].textContent).toContain('Alice');
    expect(firstRowCells[2].textContent).toBe('+3.50');
    expect(firstRowCells[2].className).toContain('text-emerald-');
    expect(firstRowCells[3].textContent).toBe('12');

    const secondRowCells = within(rows[1]).getAllByRole('cell');
    expect(secondRowCells[1].textContent).toContain('Bob');
    expect(secondRowCells[2].textContent).toBe('-1.25');
    expect(secondRowCells[2].className).toContain('text-rose-');
    expect(secondRowCells[3].textContent).toBe('9');
  });
});

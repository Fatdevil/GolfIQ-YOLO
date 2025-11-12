import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventContextProvider } from '@web/events/context';
import { EventSGLeaderboard } from '@web/sg/EventSGLeaderboard';
import { EventTopSGShots } from '@web/sg/EventTopSGShots';
import { __testing, type Anchor, type RunSG } from '@web/sg/hooks';

type DemoData = {
  sg: Record<string, RunSG>;
  anchors: Record<string, Anchor[]>;
};

const demoData: DemoData = {
  sg: {
    'run-alice': {
      total_sg: 2.0,
      holes: [
        {
          hole: 1,
          sg: 2.0,
          shots: [
            { hole: 1, shot: 1, sg_delta: 1.5 },
            { hole: 1, shot: 2, sg_delta: 0.5 },
          ],
        },
      ],
    },
    'run-bob': {
      total_sg: 1.1,
      holes: [
        {
          hole: 1,
          sg: 1.1,
          shots: [
            { hole: 1, shot: 1, sg_delta: 0.3 },
            { hole: 1, shot: 2, sg_delta: 0.8 },
          ],
        },
      ],
    },
  },
  anchors: {
    'run-alice': [
      {
        runId: 'run-alice',
        hole: 1,
        shot: 1,
        clipId: 'clip-alice-h1s1',
        tStartMs: 500,
        tEndMs: 6000,
        version: 1,
        ts: Date.now(),
      },
      {
        runId: 'run-alice',
        hole: 1,
        shot: 2,
        clipId: 'clip-alice-h1s2',
        tStartMs: 0,
        tEndMs: 4000,
        version: 1,
        ts: Date.now(),
      },
    ],
    'run-bob': [
      {
        runId: 'run-bob',
        hole: 1,
        shot: 1,
        clipId: 'clip-bob-h1s1',
        tStartMs: 1200,
        tEndMs: 5000,
        version: 1,
        ts: Date.now(),
      },
      {
        runId: 'run-bob',
        hole: 1,
        shot: 2,
        clipId: 'clip-bob-h1s2',
        tStartMs: 300,
        tEndMs: 4200,
        version: 1,
        ts: Date.now(),
      },
    ],
  },
};

describe('sg demo smoke', () => {
  const originalFetch = global.fetch;
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    __testing.clearCache();
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const match = /\/api\/runs\/([^/]+)\/(sg|anchors)$/.exec(url);
      if (!match) {
        return Promise.reject(new Error(`Unexpected request: ${url}`));
      }
      const [, runId, resource] = match;
      if (resource === 'sg') {
        const payload = demoData.sg[runId];
        if (!payload) {
          return Promise.reject(new Error(`Missing sg payload for ${runId}`));
        }
        return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
      }
      const payload = demoData.anchors[runId];
      if (!payload) {
        return Promise.reject(new Error(`Missing anchors payload for ${runId}`));
      }
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
    });
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fetchSpy.mockReset();
  });

  it('renders SG leaderboard and allows watching a top shot', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <EventContextProvider
        value={{
          eventId: 'evt-s16-demo',
          members: [
            { id: 'member-alice', name: 'Alice' },
            { id: 'member-bob', name: 'Bob' },
          ],
          runs: [
            { runId: 'run-alice', memberId: 'member-alice' },
            { runId: 'run-bob', memberId: 'member-bob' },
          ],
          isClipVisible: () => true,
        }}
      >
        <div>
          <EventSGLeaderboard />
          <EventTopSGShots />
        </div>
      </EventContextProvider>,
    );

    expect(await screen.findByRole('heading', { name: /strokes-gained leaderboard/i })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: /top sg shots/i })).toBeTruthy();

    const deltas = await screen.findAllByLabelText(/strokes gained delta/i);
    expect(deltas.length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /watch alice hole 1 shot 1/i }));

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalled();
    });

    const event = dispatchSpy.mock.calls.at(0)?.[0] as CustomEvent<{ clipId: string; tMs: number }> | undefined;
    expect(event?.detail).toEqual({ clipId: 'clip-alice-h1s1', tMs: 500 });

    dispatchSpy.mockRestore();
  });
});

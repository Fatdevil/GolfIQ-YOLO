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
      run_id: 'run-alice',
      sg_total: 2.0,
      holes: [
        {
          hole: 1,
          sg_total: 2.0,
          shots: [
            { hole: 1, shot: 1, sg_delta: 1.5 },
            { hole: 1, shot: 2, sg_delta: 0.5 },
          ],
        },
      ],
    },
    'run-bob': {
      run_id: 'run-bob',
      sg_total: 1.1,
      holes: [
        {
          hole: 1,
          sg_total: 1.1,
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
        run_id: 'run-alice',
        hole: 1,
        shot: 1,
        clip_id: 'clip-alice-h1s1',
        t_start_ms: 500,
        t_end_ms: 6000,
        version: 1,
        created_ts: Date.now() - 2000,
        updated_ts: Date.now() - 1000,
      },
      {
        run_id: 'run-alice',
        hole: 1,
        shot: 2,
        clip_id: 'clip-alice-h1s2',
        t_start_ms: 0,
        t_end_ms: 4000,
        version: 1,
        created_ts: Date.now() - 1500,
        updated_ts: Date.now() - 500,
      },
    ],
    'run-bob': [
      {
        run_id: 'run-bob',
        hole: 1,
        shot: 1,
        clip_id: 'clip-bob-h1s1',
        t_start_ms: 1200,
        t_end_ms: 5000,
        version: 1,
        created_ts: Date.now() - 3000,
        updated_ts: Date.now() - 2000,
      },
      {
        run_id: 'run-bob',
        hole: 1,
        shot: 2,
        clip_id: 'clip-bob-h1s2',
        t_start_ms: 300,
        t_end_ms: 4200,
        version: 1,
        created_ts: Date.now() - 2500,
        updated_ts: Date.now() - 1500,
      },
    ],
  },
};

describe('sg demo smoke', () => {
  const originalFetch = global.fetch;
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv?.('VITE_FEATURE_SG', '1');
    __testing.clearCache();
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const match = /\/api\/sg\/runs\/([^/]+)(?:\/(anchors))?$/.exec(url);
      if (!match) {
        return Promise.reject(new Error(`Unexpected request: ${url}`));
      }
      const [, runId, resource] = match;
      if (resource === 'anchors') {
        const payload = demoData.anchors[runId];
        if (!payload) {
          return Promise.reject(new Error(`Missing anchors payload for ${runId}`));
        }
        return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
      }
      const payload = demoData.sg[runId];
      if (!payload) {
        return Promise.reject(new Error(`Missing sg payload for ${runId}`));
      }
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
    });
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.unstubAllEnvs?.();
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
    expect(await screen.findByRole('heading', { name: /top sg-slag/i })).toBeTruthy();

    const deltas = await screen.findAllByLabelText(/strokes gained för slaget/i);
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

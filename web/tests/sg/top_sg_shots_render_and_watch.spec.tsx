import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Anchor, RunSG } from '@web/sg/hooks';
import { TopSGShots } from '@web/sg/TopSGShots';
import { __testing } from '@web/sg/hooks';

const runId = 'run-123';

const sgPayload: RunSG = {
  total_sg: 2.1,
  holes: [
    {
      hole: 1,
      sg: 0.5,
      shots: [
        { hole: 1, shot: 1, sg_delta: 0.5 },
        { hole: 1, shot: 2, sg_delta: -0.25 },
      ],
    },
    {
      hole: 2,
      sg: 1.6,
      shots: [
        { hole: 2, shot: 1, sg_delta: 1.2 },
        { hole: 2, shot: 2, sg_delta: 0.4 },
      ],
    },
  ],
};

const anchorsPayload: Anchor[] = [
  {
    runId,
    hole: 1,
    shot: 1,
    clipId: 'clip-1',
    tStartMs: 1500,
    tEndMs: 4000,
    version: 1,
    ts: Date.now(),
  },
  {
    runId,
    hole: 2,
    shot: 1,
    clipId: 'clip-2',
    tStartMs: 3200,
    tEndMs: 5200,
    version: 1,
    ts: Date.now(),
  },
  {
    runId,
    hole: 2,
    shot: 2,
    clipId: 'clip-3',
    tStartMs: 4100,
    tEndMs: 6000,
    version: 1,
    ts: Date.now(),
  },
];

describe('TopSGShots', () => {
  const originalFetch = global.fetch;
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    __testing.clearCache();
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/sg')) {
        return Promise.resolve(new Response(JSON.stringify(sgPayload), { status: 200 }));
      }
      if (url.endsWith('/anchors')) {
        return Promise.resolve(new Response(JSON.stringify(anchorsPayload), { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fetchSpy.mockReset();
  });

  it('renders positive deltas sorted descending and dispatches watch event', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(<TopSGShots runId={runId} />);

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('H2 • S1');
    expect(items[1].textContent).toContain('H1 • S1');
    expect(items[2].textContent).toContain('H2 • S2');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /watch hole 2 shot 1/i }));

    await waitFor(() => expect(dispatchSpy).toHaveBeenCalled());
    const event = dispatchSpy.mock.calls[0]?.[0] as CustomEvent<{ clipId: string; tMs: number }>;
    expect(event.detail).toEqual({ clipId: 'clip-2', tMs: 3200 });

    dispatchSpy.mockRestore();
  });
});

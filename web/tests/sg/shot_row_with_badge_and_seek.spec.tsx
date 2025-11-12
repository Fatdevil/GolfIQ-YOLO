import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShotList } from '@web/features/runs/ShotList';
import { __testing } from '@web/sg/hooks';
import type { Anchor, RunSG } from '@web/sg/hooks';

const runId = 'run-123';

const sgPayload: RunSG = {
  total_sg: 0.75,
  holes: [
    {
      hole: 1,
      sg: 0.75,
      shots: [
        { hole: 1, shot: 1, sg_delta: 0.75 },
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
    tStartMs: 3210,
    tEndMs: 6000,
    version: 1,
    ts: Date.now(),
  },
];

describe('ShotList watch interactions', () => {
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
  });

  it('renders SG badge and dispatches seek event when watching a clip', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const pushSpy = vi.spyOn(window.history, 'pushState');

    render(
      <ShotList
        runId={runId}
        shots={[{ hole: 1, shot: 1, clipId: 'clip-1', hidden: false, visibility: 'public' }]}
      />,
    );

    await screen.findByRole('button', { name: /^watch$/i });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^watch$/i }));

    await waitFor(() => expect(dispatchSpy).toHaveBeenCalled());
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent<{ clipId: string; tMs: number }>;
    expect(event.type).toBe('player:open');
    expect(event.detail).toEqual({ clipId: 'clip-1', tMs: 3210 });

    expect(pushSpy).not.toHaveBeenCalled();

    dispatchSpy.mockRestore();
    pushSpy.mockRestore();
  });

  it('allows clicking the SG badge to open the clip', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <ShotList
        runId={runId}
        shots={[{ hole: 1, shot: 1, clipId: 'clip-1', hidden: false, visibility: 'public' }]}
      />,
    );

    const user = userEvent.setup();
    const badgeButton = await screen.findByRole('button', {
      name: /watch clip for hole 1 shot 1/i,
    });
    await user.click(badgeButton);

    await waitFor(() => expect(dispatchSpy).toHaveBeenCalled());
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent<{ clipId: string; tMs: number }>;
    expect(event.detail).toEqual({ clipId: 'clip-1', tMs: 3210 });

    dispatchSpy.mockRestore();
  });
});

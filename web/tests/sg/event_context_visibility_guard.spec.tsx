import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventContextProvider } from '@web/events/context';
import type { Anchor, RunSG } from '@web/sg/hooks';
import { __testing } from '@web/sg/hooks';
import { EventTopSGShots } from '@web/sg/EventTopSGShots';

const runId = 'run-context';

const sgPayload: RunSG = {
  total_sg: 2.0,
  holes: [
    {
      hole: 3,
      sg: 1.2,
      shots: [
        { hole: 3, shot: 1, sg_delta: 0.9 },
        { hole: 3, shot: 2, sg_delta: 0.3 },
      ],
    },
  ],
};

const anchorsPayload: Anchor[] = [
  {
    runId,
    hole: 3,
    shot: 1,
    clipId: 'clip-visible',
    tStartMs: 1000,
    tEndMs: 2000,
    version: 1,
    ts: Date.now(),
  },
  {
    runId,
    hole: 3,
    shot: 2,
    clipId: 'clip-hidden',
    tStartMs: 1500,
    tEndMs: 2600,
    version: 1,
    ts: Date.now(),
  },
];

describe('EventTopSGShots context visibility guard', () => {
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

  it('uses event context isClipVisible to filter clips', async () => {
    render(
      <EventContextProvider
        value={{
          eventId: 'event-ctx',
          members: [{ id: 'member-1', name: 'Member One' }],
          runs: [{ memberId: 'member-1', runId }],
          isClipVisible: (clipId) => clipId === 'clip-visible',
        }}
      >
        <EventTopSGShots limit={5} />
      </EventContextProvider>,
    );

    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('H3 • S1');
    expect(screen.queryByText('H3 • S2')).toBeNull();
  });
});

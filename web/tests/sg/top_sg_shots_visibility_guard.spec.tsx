import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Anchor, RunSG } from '@web/sg/hooks';
import { TopSGShots } from '@web/sg/TopSGShots';
import { __testing } from '@web/sg/hooks';

const runId = 'run-visibility';

const sgPayload: RunSG = {
  total_sg: 1.0,
  holes: [
    {
      hole: 4,
      sg: 1.0,
      shots: [
        { hole: 4, shot: 1, sg_delta: 0.6 },
        { hole: 4, shot: 2, sg_delta: 0.4 },
      ],
    },
  ],
};

const anchorsPayload: Anchor[] = [
  {
    runId,
    hole: 4,
    shot: 1,
    clipId: 'clip-visible',
    tStartMs: 2000,
    tEndMs: 4000,
    version: 1,
    ts: Date.now(),
  },
  {
    runId,
    hole: 4,
    shot: 2,
    clipId: 'clip-hidden',
    tStartMs: 2600,
    tEndMs: 4200,
    version: 1,
    ts: Date.now(),
  },
];

describe('TopSGShots visibility guard', () => {
  const originalFetch = global.fetch;
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv?.('VITE_FEATURE_SG', '1');
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
    vi.unstubAllEnvs?.();
    global.fetch = originalFetch;
    fetchSpy.mockReset();
  });

  it('omits clips that are not visible', async () => {
    render(
      <TopSGShots
        runId={runId}
        isClipVisible={(clipId) => clipId !== 'clip-hidden'}
      />,
    );

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('H4 • S1');
    expect(screen.queryByText('H4 • S2')).toBeNull();
  });
});

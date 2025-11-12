import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Anchor, RunSG } from '@web/sg/hooks';
import { TopSGShots } from '@web/sg/TopSGShots';
import { __testing } from '@web/sg/hooks';

const runId = 'run-fallback';

const sgPayload: RunSG = {
  total_sg: 1.1,
  holes: [
    {
      hole: 7,
      sg: 1.1,
      shots: [
        { hole: 7, shot: 1, sg_delta: 0.6 },
        { hole: 7, shot: 2, sg_delta: 0.5 },
      ],
    },
  ],
};

const anchorsPayload: Anchor[] = [
  {
    runId,
    hole: 7,
    shot: 1,
    clipId: 'clip-a',
    tStartMs: 1200,
    tEndMs: 2400,
    version: 1,
    ts: Date.now(),
  },
  {
    runId,
    hole: 7,
    shot: 2,
    clipId: 'clip-b',
    tStartMs: 1800,
    tEndMs: 2600,
    version: 1,
    ts: Date.now(),
  },
];

describe('TopSGShots default visibility fallback', () => {
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

  it('renders no rows when context is absent', async () => {
    render(<TopSGShots runId={runId} />);

    const message = await screen.findByText('No positive strokes-gained shots yet.');
    expect(message).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});

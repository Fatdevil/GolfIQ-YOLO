import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Anchor, RunSG } from '@web/sg/hooks';
import { TopSGShots } from '@web/sg/TopSGShots';
import { __testing } from '@web/sg/hooks';

const runId = 'run-fallback';

const sgPayload: RunSG = {
  run_id: runId,
  sg_total: 1.1,
  holes: [
    {
      hole: 7,
      sg_total: 1.1,
      shots: [
        { hole: 7, shot: 1, sg_delta: 0.6 },
        { hole: 7, shot: 2, sg_delta: 0.5 },
      ],
    },
  ],
};

const anchorsPayload: Anchor[] = [
  {
    run_id: runId,
    hole: 7,
    shot: 1,
    clip_id: 'clip-a',
    t_start_ms: 1200,
    t_end_ms: 2400,
    version: 1,
    created_ts: Date.now() - 2000,
    updated_ts: Date.now() - 1000,
  },
  {
    run_id: runId,
    hole: 7,
    shot: 2,
    clip_id: 'clip-b',
    t_start_ms: 1800,
    t_end_ms: 2600,
    version: 1,
    created_ts: Date.now() - 1500,
    updated_ts: Date.now() - 500,
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
      if (url.includes('/api/sg/runs/') && url.endsWith('/anchors')) {
        return Promise.resolve(new Response(JSON.stringify(anchorsPayload), { status: 200 }));
      }
      if (url.includes('/api/sg/runs/')) {
        return Promise.resolve(new Response(JSON.stringify(sgPayload), { status: 200 }));
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

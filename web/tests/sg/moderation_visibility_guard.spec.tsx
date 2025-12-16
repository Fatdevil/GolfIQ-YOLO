import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShotList } from '@web/features/runs/ShotList';
import { __testing } from '@web/sg/hooks';
import type { Anchor, RunSG } from '@web/sg/hooks';

const runId = 'run-456';

const sgPayload: RunSG = {
  run_id: runId,
  sg_total: 1.2,
  holes: [
    {
      hole: 2,
      sg_total: 1.2,
      shots: [
        { hole: 2, shot: 1, sg_delta: 0.6 },
        { hole: 2, shot: 2, sg_delta: 0.6 },
      ],
    },
  ],
};

const anchorsPayload: Anchor[] = [
  {
    run_id: runId,
    hole: 2,
    shot: 1,
    clip_id: 'clip-hidden',
    t_start_ms: 1000,
    t_end_ms: 4000,
    version: 1,
    created_ts: Date.now() - 4000,
    updated_ts: Date.now() - 2000,
  },
  {
    run_id: runId,
    hole: 2,
    shot: 2,
    clip_id: 'clip-restricted',
    t_start_ms: 2000,
    t_end_ms: 5000,
    version: 1,
    created_ts: Date.now() - 3500,
    updated_ts: Date.now() - 1500,
  },
];

describe('ShotList moderation guards', () => {
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
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.unstubAllEnvs?.();
    global.fetch = originalFetch;
  });

  it('suppresses badges and watch buttons for hidden or restricted clips', async () => {
    render(
      <ShotList
        runId={runId}
        shots={[
          { hole: 2, shot: 1, clipId: 'clip-hidden', hidden: true, visibility: 'public' },
          { hole: 2, shot: 2, clipId: 'clip-restricted', hidden: false, visibility: 'friends' },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Restricted').length).toBe(2);
    });

    const rows = screen.getAllByRole('row').slice(1) as HTMLElement[]; // skip header row
    rows.forEach((row: HTMLElement) => {
      const scope = within(row);
      expect(scope.queryByLabelText('Strokes Gained för slaget')).toBeNull();
      expect(scope.queryByRole('button', { name: /watch/i })).toBeNull();
    });

    expect(screen.getAllByText('Hidden')).toHaveLength(2);
    expect(screen.getAllByText('Restricted')).toHaveLength(2);
  });
});

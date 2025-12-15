import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __testing, useRunAnchors, useRunSG } from '@web/sg/hooks';
import type { Anchor, RunSG } from '@web/sg/hooks';
import { useEffect } from 'react';

type ProbeProps = { runId: string };

function HookProbe({ runId }: ProbeProps) {
  const { data: sg, loading: sgLoading } = useRunSG(runId);
  const { data: anchors, loading: anchorLoading } = useRunAnchors(runId);

  useEffect(() => {
    // noop to satisfy hooks lints
  }, [sg, anchors]);

  return (
    <div>
      <div>{sgLoading ? 'sg-loading' : `sg:${sg?.sg_total ?? 'na'}`}</div>
      <div>{anchorLoading ? 'anc-loading' : `anc:${anchors?.length ?? 0}`}</div>
    </div>
  );
}

describe('useRunSG & useAnchors', () => {
  const originalFetch = global.fetch;
  const fetchSpy = vi.fn<typeof fetch>();

  const mockResponses = () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/sg/runs/') && url.endsWith('/anchors')) {
        const anchors: Anchor[] = [
          {
            run_id: 'run-123',
            hole: 1,
            shot: 1,
            clip_id: 'clip-1',
            t_start_ms: 1500,
            t_end_ms: 4500,
            version: 1,
            created_ts: Date.now() - 1000,
            updated_ts: Date.now(),
          },
        ];
        return Promise.resolve(new Response(JSON.stringify(anchors), { status: 200 }));
      }
      if (url.includes('/api/sg/runs/')) {
        const body: RunSG = {
          run_id: 'run-123',
          sg_total: 2.5,
          holes: [
            {
              hole: 1,
              sg_total: 1.25,
              shots: [
                { hole: 1, shot: 1, sg_delta: 0.75 },
                { hole: 1, shot: 2, sg_delta: 0.5 },
              ],
            },
          ],
        };
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });
  };

  beforeEach(() => {
    __testing.clearCache();
    fetchSpy.mockReset();
    mockResponses();
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it('fetches SG and anchors once per run and reuses cache', async () => {
    const { unmount } = render(<HookProbe runId="run-123" />);

    await waitFor(() => screen.getByText('sg:2.5'));
    screen.getByText('anc:1');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    unmount();

    render(<HookProbe runId="run-123" />);
    screen.getByText('sg:2.5');
    screen.getByText('anc:1');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

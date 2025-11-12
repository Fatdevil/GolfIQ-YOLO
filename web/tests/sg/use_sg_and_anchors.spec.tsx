import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __testing, useAnchors, useRunSG } from '@web/sg/hooks';
import type { Anchor, RunSG } from '@web/sg/hooks';
import { useEffect } from 'react';

type ProbeProps = { runId: string };

function HookProbe({ runId }: ProbeProps) {
  const { data: sg, loading: sgLoading } = useRunSG(runId);
  const { data: anchors, loading: anchorLoading } = useAnchors(runId);

  useEffect(() => {
    // noop to satisfy hooks lints
  }, [sg, anchors]);

  return (
    <div>
      <div>{sgLoading ? 'sg-loading' : `sg:${sg?.total_sg ?? 'na'}`}</div>
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
      if (url.endsWith('/sg')) {
        const body: RunSG = {
          total_sg: 2.5,
          holes: [
            {
              hole: 1,
              sg: 1.25,
              shots: [
                { hole: 1, shot: 1, sg_delta: 0.75 },
                { hole: 1, shot: 2, sg_delta: 0.5 },
              ],
            },
          ],
        };
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      }
      if (url.endsWith('/anchors')) {
        const anchors: Anchor[] = [
          {
            runId: 'run-123',
            hole: 1,
            shot: 1,
            clipId: 'clip-1',
            tStartMs: 1500,
            tEndMs: 4500,
            version: 1,
            ts: Date.now(),
          },
        ];
        return Promise.resolve(new Response(JSON.stringify(anchors), { status: 200 }));
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });
  };

  beforeEach(() => {
    __testing.clearCache();
    fetchSpy.mockReset();
    mockResponses();
    global.fetch = fetchSpy;
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

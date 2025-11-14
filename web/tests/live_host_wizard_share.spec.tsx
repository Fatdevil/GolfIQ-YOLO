import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import HostLiveWizard from '@web/features/live/HostLiveWizard';
import { DEFAULT_SESSION, EventSessionContext } from '@web/session/eventSession';
import * as api from '@web/api';
import * as copyUtils from '@web/utils/copy';

type JsonResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

describe('HostLiveWizard share action', () => {
  const adminSession = { ...DEFAULT_SESSION, role: 'admin' as const, memberId: 'admin-1', safe: false, tournamentSafe: false };
  const globalAny = globalThis as { fetch?: typeof fetch };
  let originalFetch: typeof fetch | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;
  let copySpy: MockInstance<typeof copyUtils.copyToClipboard>;
  let telemetrySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalFetch = globalAny.fetch;
    fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (requestUrl.endsWith('/events/evt-share/live')) {
        const payload = {
          isLive: true,
          viewerUrl: 'https://origin.example/hls/evt-share/master.m3u8',
          startedTs: null,
          updatedTs: null,
          streamId: 'stream-evt-share',
          latencyMode: null,
        };
        return Promise.resolve({ ok: true, status: 200, json: async () => payload } as JsonResponse);
      }
      if (requestUrl.endsWith('/api/events/evt-share/live/viewer-token')) {
        const tokenPayload = {
          viewerUrl: 'https://cdn.example/hls/evt-share/master.m3u8?sig=first',
          expTs: Math.floor(Date.now() / 1000) + 60,
        };
        return Promise.resolve({ ok: true, status: 200, json: async () => tokenPayload } as JsonResponse);
      }
      if (requestUrl.endsWith('/events/evt-share/live/heartbeat')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as JsonResponse);
      }
      if (requestUrl.includes('/refresh')) {
        const refreshPayload = { viewerUrl: '', expTs: Math.floor(Date.now() / 1000) + 60, refreshed: false };
        return Promise.resolve({ ok: true, status: 200, json: async () => refreshPayload } as JsonResponse);
      }
      return Promise.reject(new Error(`Unexpected fetch ${requestUrl} ${init?.method ?? 'GET'}`));
    });
    globalAny.fetch = fetchMock as unknown as typeof fetch;

    copySpy = vi.spyOn(copyUtils, 'copyToClipboard');
    copySpy.mockImplementation(async () => undefined);
    telemetrySpy = vi.spyOn(api, 'postTelemetryEvent') as ReturnType<typeof vi.spyOn>;
    telemetrySpy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalFetch) {
      globalAny.fetch = originalFetch;
    } else {
      delete globalAny.fetch;
    }
    vi.restoreAllMocks();
  });

  it('copies viewer link and emits telemetry', async () => {
    render(
      <EventSessionContext.Provider value={adminSession}>
        <HostLiveWizard eventId="evt-share" />
      </EventSessionContext.Provider>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/events/evt-share/live', { headers: {} });
    });

    await screen.findByText(/Token expires in/);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Copy' }));

    await waitFor(() => {
      expect(copySpy).toHaveBeenCalledWith('https://cdn.example/hls/evt-share/master.m3u8?sig=first');
    });

    await waitFor(() => {
      expect(telemetrySpy).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'live.viewer.share', eventId: 'evt-share' }),
      );
    });
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HostLiveWizard from '@web/features/live/HostLiveWizard';
import { DEFAULT_SESSION, EventSessionContext } from '@web/session/eventSession';
import * as api from '@web/api';

type JsonResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

describe('HostLiveWizard token refresh', () => {
  const adminSession = { ...DEFAULT_SESSION, role: 'admin' as const, memberId: 'admin-99', safe: false };
  const globalAny = globalThis as { fetch?: typeof fetch };
  let originalFetch: typeof fetch | undefined;
  let fetchMock: ReturnType<typeof vi.fn>;
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
      if (requestUrl.endsWith('/events/evt-refresh/live')) {
        const payload = {
          isLive: true,
          viewerUrl: 'https://origin.example/hls/evt-refresh/master.m3u8',
          startedTs: null,
          updatedTs: null,
          streamId: 'stream-refresh',
          latencyMode: null,
        };
        return Promise.resolve({ ok: true, status: 200, json: async () => payload } as JsonResponse);
      }
      if (requestUrl.endsWith('/api/events/evt-refresh/live/viewer-token')) {
        const tokenPayload = {
          viewerUrl: 'https://cdn.example/hls/evt-refresh/master.m3u8?sig=first',
          expTs: Math.floor(Date.now() / 1000) + 1,
        };
        return Promise.resolve({ ok: true, status: 200, json: async () => tokenPayload } as JsonResponse);
      }
      if (requestUrl.includes('/api/events/evt-refresh/live/refresh')) {
        const refreshedPayload = {
          viewerUrl: 'https://cdn.example/hls/evt-refresh/master.m3u8?sig=refreshed',
          expTs: Math.floor(Date.now() / 1000) + 120,
          refreshed: true,
        };
        return Promise.resolve({ ok: true, status: 200, json: async () => refreshedPayload } as JsonResponse);
      }
      if (requestUrl.endsWith('/events/evt-refresh/live/heartbeat')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as JsonResponse);
      }
      return Promise.reject(new Error(`Unexpected fetch ${requestUrl} ${init?.method ?? 'GET'}`));
    });
    globalAny.fetch = fetchMock as unknown as typeof fetch;

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

  it('auto-refreshes viewer URL near expiry and emits telemetry', async () => {
    render(
      <EventSessionContext.Provider value={adminSession}>
        <HostLiveWizard eventId="evt-refresh" />
      </EventSessionContext.Provider>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/events/evt-refresh/live/viewer-token',
        { headers: {}, method: 'POST' },
      );
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:8000/api/events/evt-refresh/live/refresh?expTs='),
        expect.anything(),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/sig=refreshed/)).toBeTruthy();
    });

    await waitFor(() => {
      expect(telemetrySpy).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'live.viewer.refresh', eventId: 'evt-refresh' }),
      );
    });
  });
});

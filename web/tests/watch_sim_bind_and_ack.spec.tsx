import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DevWatchSimulator from '@web/watch/DevWatchSimulator';

vi.mock('@web/api', async () => {
  const actual = await vi.importActual<typeof import('@web/api')>('@web/api');
  return {
    ...actual,
    API: 'http://localhost:9999',
    getApiKey: () => 'dev-key',
  };
});

type FetchCall = [RequestInfo, RequestInit | undefined];

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  handlers: Record<string, (event: MessageEvent) => void> = {};
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (event: MessageEvent) => void) {
    this.handlers[type] = handler;
  }

  removeEventListener(type: string) {
    delete this.handlers[type];
  }

  close() {}

  emitOpen() {
    this.onopen?.(new Event('open'));
  }

  emitTip(payload: unknown) {
    const handler = this.handlers['tip'];
    if (handler) {
      handler(new MessageEvent('tip', { data: JSON.stringify(payload) }));
    }
  }
}

describe('DevWatchSimulator', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    MockEventSource.instances = [];
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('registers, binds, opens stream, and posts ACKs with auth header', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ deviceId: 'dev-1', deviceSecret: 'sec-abc' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ token: 'tok-123', expTs: 999_999 }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status: 'ok' }) });

    render(<DevWatchSimulator joinCode="654321" />);

    await userEvent.click(screen.getByRole('button', { name: /register device/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as FetchCall)[0]).toBe('http://localhost:9999/api/watch/devices/register');
    expect(screen.getByText(/dev-1/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /bind with code/i }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1] as FetchCall)[0]).toBe('http://localhost:9999/api/watch/devices/bind');

    const source = MockEventSource.instances.at(-1);
    expect(source).toBeDefined();
    expect(source?.url).toBe('http://localhost:9999/api/watch/devices/stream?token=tok-123');

    source?.emitOpen();
    source?.emitTip({ tipId: 'tip-1', title: 'First tip', body: 'Hello' });

    await screen.findByText(/First tip/);

    await userEvent.click(screen.getByRole('button', { name: /ack tip/i }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const ackRequest = fetchMock.mock.calls[2] as FetchCall;
    expect(ackRequest[0]).toBe('http://localhost:9999/api/watch/devices/ack');
    expect(ackRequest[1]?.headers).toMatchObject({ Authorization: 'Bearer tok-123' });
  });
});

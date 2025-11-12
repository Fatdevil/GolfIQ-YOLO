import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

const copyToClipboard = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn() }));
const emitTelemetry = vi.hoisted(() => vi.fn());

vi.mock('@web/api', () => ({
  getApiKey: () => 'test-share',
}));

vi.mock('@web/utils/copy', () => ({
  copyToClipboard,
}));

vi.mock('@web/ui/toast', () => ({ toast }));

vi.mock('@web/share/telemetry', () => ({ emitTelemetry }));

import { shareAnchor } from '@web/share/anchor';

describe('shareAnchor', () => {
  const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');

  beforeEach(() => {
    copyToClipboard.mockReset();
    toast.error.mockReset();
    emitTelemetry.mockReset();
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    if (originalShare) {
      Object.defineProperty(navigator, 'share', originalShare);
    } else {
      Reflect.deleteProperty(navigator as Navigator & { share?: unknown }, 'share');
    }
  });

  it('uses navigator.share when available', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: shareMock,
      writable: true,
    });

    const origin = window.location.origin;

    (global.fetch as unknown as Mock).mockResolvedValue(
      new Response(JSON.stringify({ sid: 'short123', url: '/s/short123', ogUrl: '/s/short123/o' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await shareAnchor({ runId: 'run-a', hole: 4, shot: 2 });

    expect(global.fetch).toHaveBeenCalledWith('/api/share/anchor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-share' },
      body: JSON.stringify({ runId: 'run-a', hole: 4, shot: 2 }),
    });
    const expectedLink = new URL('/s/short123', origin).toString();
    const expectedOg = new URL('/s/short123/o', origin).toString();

    expect(shareMock).toHaveBeenCalledWith({ title: 'GolfIQ', text: 'Check this shot', url: expectedLink });
    expect(copyToClipboard).not.toHaveBeenCalled();
    expect(emitTelemetry).toHaveBeenCalledWith('share.anchor.ui', {
      runId: 'run-a',
      hole: 4,
      shot: 2,
      sid: 'short123',
    });
    expect(result).toEqual({
      link: expectedLink,
      ogUrl: expectedOg,
      sid: 'short123',
    });
  });

  it('copies to clipboard when Web Share API is unavailable', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
      writable: true,
    });

    const origin = window.location.origin;

    copyToClipboard.mockResolvedValue(undefined);
    (global.fetch as unknown as Mock).mockResolvedValue(
      new Response(JSON.stringify({ sid: 'short999', url: '/s/short999', ogUrl: '/s/short999/o' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await shareAnchor({ runId: 'run-b', hole: 7, shot: 1 });

    const expectedLink = new URL('/s/short999', origin).toString();
    const expectedOg = new URL('/s/short999/o', origin).toString();

    expect(copyToClipboard).toHaveBeenCalledWith(expectedLink);
    expect(emitTelemetry).toHaveBeenCalledWith('share.anchor.ui', {
      runId: 'run-b',
      hole: 7,
      shot: 1,
      sid: 'short999',
    });
    expect(result).toEqual({
      link: expectedLink,
      ogUrl: expectedOg,
      sid: 'short999',
    });
  });

  it('shows an error when the clip is not public', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
      writable: true,
    });

    (global.fetch as unknown as Mock).mockResolvedValue(
      new Response('', { status: 409 }),
    );

    const result = await shareAnchor({ runId: 'run-c', hole: 9, shot: 3 });

    expect(result).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Cannot share non-public clip');
    expect(copyToClipboard).not.toHaveBeenCalled();
    expect(emitTelemetry).not.toHaveBeenCalled();
  });
});

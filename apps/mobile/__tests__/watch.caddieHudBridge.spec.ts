import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('caddieHudBridge', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('is unavailable before a sender is registered', async () => {
    const { isCaddieHudAvailable } = await import('@app/watch/caddieHudBridge');
    expect(isCaddieHudAvailable()).toBe(false);
  });

  it('becomes available after registering a sender', async () => {
    const { isCaddieHudAvailable, registerCaddieHudSender } = await import('@app/watch/caddieHudBridge');
    registerCaddieHudSender(vi.fn());
    expect(isCaddieHudAvailable()).toBe(true);
  });

  it('logs and ignores messages when sender is missing', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { sendCaddieHudClear, sendCaddieHudUpdate } = await import('@app/watch/caddieHudBridge');

    sendCaddieHudUpdate({
      rawDistanceM: 150,
      playsLikeDistanceM: 155,
      club: '7i',
      intent: 'fade',
      riskProfile: 'safe',
    });
    sendCaddieHudClear();

    expect(debugSpy).toHaveBeenCalled();
  });

  it('invokes the sender for update and clear', async () => {
    const { registerCaddieHudSender, sendCaddieHudUpdate, sendCaddieHudClear } = await import(
      '@app/watch/caddieHudBridge'
    );
    const handler = vi.fn();
    registerCaddieHudSender(handler);

    sendCaddieHudUpdate({
      rawDistanceM: 146,
      playsLikeDistanceM: 152,
      club: '7i',
      intent: 'straight',
      riskProfile: 'normal',
      holeNumber: 7,
    });
    sendCaddieHudClear();

    expect(handler).toHaveBeenNthCalledWith(1, {
      type: 'hud.update',
      payload: {
        rawDistanceM: 146,
        playsLikeDistanceM: 152,
        club: '7i',
        intent: 'straight',
        riskProfile: 'normal',
        holeNumber: 7,
      },
    });
    expect(handler).toHaveBeenNthCalledWith(2, { type: 'hud.clear' });
  });
});

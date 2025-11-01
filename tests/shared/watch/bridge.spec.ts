import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WatchHUDStateV1 } from '../../../shared/watch/codec';

const baseState: WatchHUDStateV1 = {
  v: 1,
  ts: Date.now(),
  fmb: { front: 120, middle: 130, back: 140 },
  playsLikePct: 4,
  wind: { mps: 3, deg: 90 },
  tournamentSafe: true,
};

type BridgeConfig = {
  platform?: 'android' | 'ios' | 'web';
  nativeModules?: Record<string, unknown>;
};

const createBridge = async (config: BridgeConfig = {}) => {
  vi.resetModules();
  vi.doMock(
    'react-native',
    () => ({
      Platform: { OS: config.platform ?? 'web' },
      NativeModules: config.nativeModules ?? {},
    }),
    { virtual: true },
  );
  const module = await import('../../../shared/watch/bridge');
  return module.WatchBridge;
};

afterEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  vi.useRealTimers();
});

describe('WatchBridge (web fallback)', () => {
  it('reports incapable when native module is missing', async () => {
    const WatchBridge = await createBridge();
    await expect(WatchBridge.isCapable()).resolves.toBe(false);
  });

  it('does not attempt to send when native module is missing', async () => {
    const WatchBridge = await createBridge();
    await expect(WatchBridge.sendHUD(baseState)).resolves.toBe(false);
    const status = WatchBridge.getLastStatus();
    expect(status.ok).toBe(false);
    expect(status.ts).toBeGreaterThan(0);
    expect(status.bytes).toBeGreaterThan(0);
  });
});

describe('WatchBridge diagnostics', () => {
  it('captures last status on successful send', async () => {
    const sendHUD = vi.fn().mockResolvedValue(true);
    const isCapable = vi.fn().mockResolvedValue(true);
    const WatchBridge = await createBridge({
      platform: 'android',
      nativeModules: {
        WatchConnector: {
          isCapable,
          sendHUD,
        },
      },
    });
    await expect(WatchBridge.sendHUD(baseState)).resolves.toBe(true);
    expect(sendHUD).toHaveBeenCalledTimes(1);
    const status = WatchBridge.getLastStatus();
    expect(status.ok).toBe(true);
    expect(status.bytes).toBeGreaterThan(0);
    expect(status.ts).toBeGreaterThan(0);
  });

  it('debounces rapid send requests', async () => {
    const sendHUD = vi.fn().mockResolvedValue(true);
    const WatchBridge = await createBridge({
      platform: 'android',
      nativeModules: {
        WatchConnector: {
          isCapable: vi.fn().mockResolvedValue(true),
          sendHUD,
        },
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const first = WatchBridge.sendHUDDebounced(baseState, { minIntervalMs: 500 });
    const second = WatchBridge.sendHUDDebounced(baseState, { minIntervalMs: 500 });
    expect(first).toBe(second);
    expect(sendHUD).toHaveBeenCalledTimes(1);
    await first;
    vi.advanceTimersByTime(400);
    const third = WatchBridge.sendHUDDebounced(baseState, { minIntervalMs: 500 });
    expect(third).toBe(second);
    expect(sendHUD).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    const fourth = WatchBridge.sendHUDDebounced(baseState, { minIntervalMs: 500 });
    expect(sendHUD).toHaveBeenCalledTimes(2);
    await fourth;
  });
});

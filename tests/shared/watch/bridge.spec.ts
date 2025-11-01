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
  codecMock?: (state: WatchHUDStateV1) => string;
};

const createBridge = async (config: BridgeConfig = {}) => {
  vi.resetModules();
  if (config.codecMock) {
    const codec = config.codecMock;
    vi.doMock(
      '../../../shared/watch/codec',
      () => ({
        encodeHUDBase64: vi.fn((state: WatchHUDStateV1) => codec(state)),
      }),
      { virtual: true },
    );
  } else {
    vi.doUnmock('../../../shared/watch/codec');
  }
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

  it('suppresses sends until the throttle window elapses', async () => {
    const callTimes: number[] = [];
    const sendHUD = vi.fn().mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.resolve(true);
    });
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
    await first;
    expect(sendHUD).toHaveBeenCalledTimes(1);
    expect(callTimes[0]).toBe(0);

    vi.advanceTimersByTime(400);
    const second = WatchBridge.sendHUDDebounced(baseState, { minIntervalMs: 500 });
    vi.advanceTimersByTime(50);
    const third = WatchBridge.sendHUDDebounced(baseState, { minIntervalMs: 500 });
    expect(second).toBe(third);
    expect(sendHUD).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    await second;

    expect(sendHUD).toHaveBeenCalledTimes(2);
    expect(callTimes[1]).toBeGreaterThanOrEqual(500);
    expect(callTimes[1]).toBeLessThan(520);
  });

  it('coalesces trailing calls and sends the freshest payload', async () => {
    const encodeCalls: WatchHUDStateV1[] = [];
    const encodeHUDBase64 = (state: WatchHUDStateV1) => {
      encodeCalls.push(state);
      return 'payload';
    };
    const sendHUD = vi.fn().mockResolvedValue(true);
    const WatchBridge = await createBridge({
      platform: 'android',
      codecMock: encodeHUDBase64,
      nativeModules: {
        WatchConnector: {
          isCapable: vi.fn().mockResolvedValue(true),
          sendHUD,
        },
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const base = { ...baseState, playsLikePct: 1 };
    const stateA = { ...base, playsLikePct: 2 };
    const stateB = { ...base, playsLikePct: 3 };
    const stateC = { ...base, playsLikePct: 4 };

    const first = WatchBridge.sendHUDDebounced(base, { minIntervalMs: 500 });
    await first;
    expect(sendHUD).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    const trailing = WatchBridge.sendHUDDebounced(stateA, { minIntervalMs: 500 });
    vi.advanceTimersByTime(100);
    const trailingTwo = WatchBridge.sendHUDDebounced(stateB, { minIntervalMs: 500 });
    vi.advanceTimersByTime(100);
    const trailingThree = WatchBridge.sendHUDDebounced(stateC, { minIntervalMs: 500 });

    expect(trailing).toBe(trailingTwo);
    expect(trailingTwo).toBe(trailingThree);
    expect(sendHUD).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(200);
    await trailing;

    expect(sendHUD).toHaveBeenCalledTimes(2);
    expect(encodeCalls).toHaveLength(2);
    expect(encodeCalls[1]).toEqual(stateC);
  });

  it('keeps trailing send scheduled while the first request is in flight', async () => {
    let resolveFirst: ((value: boolean) => void) | null = null;
    let firstCall = true;
    const callTimes: number[] = [];
    const sendHUD = vi.fn().mockImplementation(() => {
      callTimes.push(Date.now());
      if (firstCall) {
        firstCall = false;
        return new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve(true);
    });
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
    vi.advanceTimersByTime(100);
    const trailing = WatchBridge.sendHUDDebounced({ ...baseState, playsLikePct: 6 }, { minIntervalMs: 500 });
    vi.advanceTimersByTime(100);
    const trailingTwo = WatchBridge.sendHUDDebounced({ ...baseState, playsLikePct: 7 }, { minIntervalMs: 500 });

    expect(trailing).toBe(trailingTwo);
    expect(sendHUD).toHaveBeenCalledTimes(1);

    resolveFirst?.(true);
    await first;
    expect(sendHUD).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(299);
    expect(sendHUD).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await trailing;

    expect(sendHUD).toHaveBeenCalledTimes(2);
    expect(callTimes[0]).toBe(0);
    expect(callTimes[1]).toBeGreaterThanOrEqual(500);
  });

  it('flush sends the pending payload immediately', async () => {
    const callTimes: number[] = [];
    const sendHUD = vi.fn().mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.resolve(true);
    });
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

    await WatchBridge.sendHUDDebounced(baseState, { minIntervalMs: 500 });
    expect(sendHUD).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    const trailing = WatchBridge.sendHUDDebounced({ ...baseState, playsLikePct: 11 }, { minIntervalMs: 500 });
    expect(sendHUD).toHaveBeenCalledTimes(1);

    await expect(WatchBridge.flush()).resolves.toBe(true);
    expect(sendHUD).toHaveBeenCalledTimes(2);
    expect(callTimes[1]).toBe(100);
    await trailing;
  });

  it('flush waits for the active send before dispatching the trailing payload', async () => {
    let resolveFirst: ((value: boolean) => void) | null = null;
    const callTimes: number[] = [];
    const sendHUD = vi.fn().mockImplementation(() => {
      callTimes.push(Date.now());
      if (!resolveFirst) {
        return new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve(true);
    });
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
    expect(sendHUD).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    const trailing = WatchBridge.sendHUDDebounced({ ...baseState, playsLikePct: 9 }, { minIntervalMs: 500 });
    const flushPromise = WatchBridge.flush();

    await Promise.resolve();
    expect(sendHUD).toHaveBeenCalledTimes(1);

    resolveFirst?.(true);
    await first;
    await expect(flushPromise).resolves.toBe(true);
    expect(sendHUD).toHaveBeenCalledTimes(2);
    expect(callTimes[1]).toBe(100);
    await trailing;
  });
});

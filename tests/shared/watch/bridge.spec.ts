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
  const rnMock = {
    Platform: { OS: config.platform ?? 'web' },
    NativeModules: config.nativeModules ?? {},
  };
  (globalThis as { __watchBridgeReactNative?: unknown }).__watchBridgeReactNative = rnMock;
  vi.doMock(
    'react-native',
    () => rnMock,
    { virtual: true },
  );
  const module = await import('../../../shared/watch/bridge');
  return module.WatchBridge;
};

afterEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  vi.useRealTimers();
  delete (globalThis as { __watchBridgeReactNative?: unknown }).__watchBridgeReactNative;
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

  it('cancels pending trailing send when autosend turns off', async () => {
    const base = { ...baseState, ts: 0 };
    const stateA = { ...base, playsLikePct: 8 };
    const stateB = { ...base, playsLikePct: 9 };
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

    await WatchBridge.sendHUDDebounced(stateA, { minIntervalMs: 500 });
    expect(sendHUD).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    const trailing = WatchBridge.sendHUDDebounced(stateB, { minIntervalMs: 500 });
    expect(WatchBridge.hasPending()).toBe(true);

    expect(WatchBridge.cancelPending('autosend-off')).toBe(true);
    await Promise.resolve();
    expect(WatchBridge.hasPending()).toBe(false);

    vi.advanceTimersByTime(600);
    expect(sendHUD).toHaveBeenCalledTimes(1);
    await expect(trailing).resolves.toBe(false);
    vi.useRealTimers();
  });

  it('allows immediate send after cancel', async () => {
    const base = { ...baseState, ts: 0 };
    const stateA = { ...base, playsLikePct: 12 };
    const stateB = { ...base, playsLikePct: 13 };
    const stateC = { ...base, playsLikePct: 14 };
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

    await WatchBridge.sendHUDDebounced(stateA, { minIntervalMs: 500 });
    expect(sendHUD).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    const trailing = WatchBridge.sendHUDDebounced(stateB, { minIntervalMs: 500 });
    expect(WatchBridge.cancelPending('toggle')).toBe(true);

    await WatchBridge.sendHUDDebounced(stateC, { minIntervalMs: 500 });
    expect(sendHUD).toHaveBeenCalledTimes(2);
    await expect(trailing).resolves.toBe(false);
    vi.useRealTimers();
  });
});

describe('WatchBridge messaging', () => {
  it('returns false when native module is missing', async () => {
    const WatchBridge = await createBridge();
    await expect(WatchBridge.sendMessage({ type: 'CADDIE_ACCEPTED_V1', club: '7i' })).resolves.toBe(false);
  });

  it('forwards messages to the native module', async () => {
    const sendMessage = vi.fn().mockResolvedValue(true);
    const WatchBridge = await createBridge({
      platform: 'android',
      nativeModules: {
        WatchConnector: {
          isCapable: vi.fn().mockResolvedValue(true),
          sendHUD: vi.fn().mockResolvedValue(true),
          sendMessage,
        },
      },
    });
    await expect(
      WatchBridge.sendMessage({
        type: 'CADDIE_ADVICE_V1',
        advice: { club: '8i', carry_m: 145, risk: 'neutral' },
      }),
    ).resolves.toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toContain('"type":"CADDIE_ADVICE_V1"');
  });
});

describe('parseWatchMessage', () => {
  it('preserves caddie accepted context', async () => {
    vi.resetModules();
    const { parseWatchMessage } = await import('../../../shared/watch/bridge');

    const parsed = parseWatchMessage({
      type: 'CADDIE_ACCEPTED_V1',
      runId: 'run-123',
      hole: 7,
      memberId: 'mem-9',
      courseId: 'course-5',
      selectedClub: '8i',
      recommendedClub: '7i',
      shotIndex: 2,
      adviceId: 'adv-99',
    });

    expect(parsed).toMatchObject({
      type: 'CADDIE_ACCEPTED_V1',
      club: '8i',
      selectedClub: '8i',
      recommendedClub: '7i',
      runId: 'run-123',
      memberId: 'mem-9',
      courseId: 'course-5',
      hole: 7,
      shotIndex: 2,
      adviceId: 'adv-99',
    });
  });
});

import { afterAll, describe, expect, it, vi } from 'vitest';

const rnMock = {
  Platform: { OS: 'ios' },
  NativeModules: {},
};

(globalThis as { __watchBridgeReactNative?: unknown }).__watchBridgeReactNative = rnMock;

vi.mock('react-native', () => rnMock, { virtual: true });

import { WatchBridge } from '../../../shared/watch/bridge';
import type { WatchHUDStateV1 } from '../../../shared/watch/codec';

const baseState: WatchHUDStateV1 = {
  v: 1,
  ts: Date.now(),
  fmb: { front: 120, middle: 130, back: 140 },
  playsLikePct: 4,
  wind: { mps: 3, deg: 90 },
  tournamentSafe: true,
};

describe('WatchBridge (ios fallback)', () => {
  it('reports incapable when native module is missing', async () => {
    await expect(WatchBridge.isCapable()).resolves.toBe(false);
  });

  it('does not attempt to send when native module is missing', async () => {
    await expect(WatchBridge.sendHUD(baseState)).resolves.toBe(false);
  });

  it('returns false when sending messages without native module', async () => {
    await expect(
      WatchBridge.sendMessage({ type: 'CADDIE_ADVICE_V1', advice: { club: 'PW', carry_m: 110 } }),
    ).resolves.toBe(false);
  });
});

afterAll(() => {
  delete (globalThis as { __watchBridgeReactNative?: unknown }).__watchBridgeReactNative;
});

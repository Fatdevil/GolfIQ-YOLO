import { describe, expect, it, vi } from 'vitest';

vi.mock(
  'react-native',
  () => ({
    Platform: { OS: 'ios' },
    NativeModules: {},
  }),
  { virtual: true },
);

import { WatchBridge } from '../../../shared/watch/bridge';
import type { WatchHUDStateV1 } from '../../../shared/watch/codec';

const baseState: WatchHUDStateV1 = {
  v: 1,
  ts: Date.now(),
  fmb: { front: 101, middle: 110, back: 118 },
  playsLikePct: -3,
  wind: { mps: 5, deg: 45 },
  tournamentSafe: true,
};

describe('WatchBridge (iOS fallback)', () => {
  it('resolves incapable when module not registered', async () => {
    await expect(WatchBridge.isCapable()).resolves.toBe(false);
  });

  it('does not attempt to send without native module', async () => {
    await expect(WatchBridge.sendHUD(baseState)).resolves.toBe(false);
  });
});

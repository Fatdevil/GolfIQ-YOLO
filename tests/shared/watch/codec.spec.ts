import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';

import { decodeHUD, encodeHUD } from '../../../shared/watch/codec';
import type { WatchHUDStateV1 } from '../../../shared/watch/types';

const baseState: WatchHUDStateV1 = {
  v: 1,
  ts: 1716400000000,
  fmb: { front: 128, middle: 134, back: 140 },
  playsLikePct: 6.5,
  wind: { mps: 3.2, deg: 270 },
  strategy: { profile: 'neutral', offset_m: -4, carry_m: 136 },
  tournamentSafe: false,
};

const toBytes = (value: string): Uint8Array => {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value);
  }
  return new Uint8Array(Buffer.from(value, 'utf8'));
};

describe('watch HUD codec', () => {
  it('round-trips state payloads', () => {
    const encoded = encodeHUD(baseState);
    const decoded = decodeHUD(encoded);
    expect(decoded).toEqual(baseState);
  });

  it('ignores unknown fields on decode', () => {
    const payload = {
      ...baseState,
      extra: 'ignore-me',
      fmb: { ...baseState.fmb, note: 'redundant' },
    } as Record<string, unknown>;
    const encoded = toBytes(JSON.stringify(payload));
    const decoded = decodeHUD(encoded);
    expect(decoded).toEqual(baseState);
  });

  it('guards on unsupported versions', () => {
    const payload = { ...baseState, v: 2 } as Record<string, unknown>;
    const encoded = toBytes(JSON.stringify(payload));
    expect(() => decodeHUD(encoded)).toThrow(/Unsupported HUD payload version/);
  });
});

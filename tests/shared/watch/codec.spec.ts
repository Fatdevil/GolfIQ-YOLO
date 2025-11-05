import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';

import { decodeHUD, encodeHUD, encodeHUDBase64 } from '../../../shared/watch/codec';
import type { WatchHUDStateV1 } from '../../../shared/watch/types';

const baseState: WatchHUDStateV1 = {
  v: 1,
  ts: 1716400000000,
  fmb: { front: 128, middle: 134, back: 140 },
  playsLikePct: 6.5,
  wind: { mps: 3.2, deg: 270 },
  strategy: { profile: 'neutral', offset_m: -4, carry_m: 136 },
  tournamentSafe: false,
  caddie: {
    club: '7i',
    carry_m: 152,
    total_m: 164,
    aim: { dir: 'R', offset_m: 5 },
    risk: 'neutral',
    confidence: 0.72,
  },
  overlayMini: {
    fmb: { f: 124, m: 134, b: 144 },
    pin: { section: 'middle' },
  },
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
      caddie: { ...baseState.caddie, meta: { foo: 'bar' } },
    } as Record<string, unknown>;
    const encoded = toBytes(JSON.stringify(payload));
    const decoded = decodeHUD(encoded);
    expect(decoded).toEqual(baseState);
  });

  it('drops invalid caddie hints', () => {
    const payload = {
      ...baseState,
      caddie: {
        club: '',
        carry_m: 'nan',
        risk: 'extreme',
      },
    } as Record<string, unknown>;
    const encoded = toBytes(JSON.stringify(payload));
    const decoded = decodeHUD(encoded);
    expect(decoded.caddie).toBeUndefined();
  });

  it('drops invalid overlay mini payloads', () => {
    const payload = {
      ...baseState,
      overlayMini: {
        fmb: { f: 'nan', m: 120, b: 130 },
        pin: { section: 'side' },
      },
    } as Record<string, unknown>;
    const encoded = toBytes(JSON.stringify(payload));
    const decoded = decodeHUD(encoded);
    expect(decoded.overlayMini).toBeUndefined();
  });

  it('guards on unsupported versions', () => {
    const payload = { ...baseState, v: 2 } as Record<string, unknown>;
    const encoded = toBytes(JSON.stringify(payload));
    expect(() => decodeHUD(encoded)).toThrow(/Unsupported HUD payload version/);
  });

  it('generates consistent base64 payloads', () => {
    const encoded = encodeHUD(baseState);
    const b64 = encodeHUDBase64(baseState);
    expect(b64).toEqual(Buffer.from(encoded).toString('base64'));
  });
});

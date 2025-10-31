import { describe, expect, it } from 'vitest';

import { equalB64, sha256Base64 } from '../../../shared/bundles/integrity';

function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('sha256Base64', () => {
  it('computes SHA-256 in base64', async () => {
    const digest = await sha256Base64(toBytes('hello world'));
    expect(digest).toBe('uU0nuZNNPgilLlLX2n2r+sSE7+N6U4DukIj3rOLvzek=');
  });
});

describe('equalB64', () => {
  it('treats trailing padding as equivalent', () => {
    expect(equalB64('YWJjZA==', 'YWJjZA')).toBe(true);
  });

  it('detects mismatches', () => {
    expect(equalB64('AAAA', 'AAAB')).toBe(false);
  });

  it('handles undefined inputs', () => {
    expect(equalB64(undefined, 'AAAA')).toBe(false);
    expect(equalB64(undefined, undefined)).toBe(false);
  });
});

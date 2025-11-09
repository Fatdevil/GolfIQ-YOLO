import { describe, expect, it } from 'vitest';

import { extractJoinCode } from '@app/utils/qr';

describe('extractJoinCode', () => {
  it('parses golfiq scheme payloads', () => {
    expect(extractJoinCode('golfiq://join/ABCD23C')).toBe('ABCD23C');
  });

  it('parses https join URLs', () => {
    expect(extractJoinCode('https://app.golfiq.app/join/abcd23c')).toBe('ABCD23C');
  });

  it('parses bare codes', () => {
    expect(extractJoinCode('abcd23c')).toBe('ABCD23C');
  });

  it('ignores whitespace and query params', () => {
    expect(extractJoinCode('  https://golfiq.app/join/abcd23c?ref=1  ')).toBe('ABCD23C');
  });

  it('rejects invalid values', () => {
    expect(extractJoinCode('golfiq://join/INVALID')).toBeNull();
    expect(extractJoinCode('nonsense')).toBeNull();
    expect(extractJoinCode(null)).toBeNull();
  });
});

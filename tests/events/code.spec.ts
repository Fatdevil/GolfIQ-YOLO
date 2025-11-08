import { describe, expect, it } from 'vitest';

import { generateCode, validateCode } from '@shared/events/code';

function isUppercase(value: string): boolean {
  return value === value.toUpperCase();
}

describe('events code generator', () => {
  it('produces uppercase shortcodes with checksum', () => {
    const code = generateCode();
    expect(code).toHaveLength(7);
    expect(isUppercase(code)).toBe(true);
    expect(validateCode(code)).toBe(true);
  });

  it('rejects invalid characters and casing', () => {
    const code = generateCode();
    expect(validateCode(code.toLowerCase())).toBe(false);
    expect(validateCode(code.slice(0, 6))).toBe(false);
    expect(validateCode(`${code.slice(0, 6)}0`)).toBe(false);
  });

  it('rejects incorrect checksum', () => {
    const code = generateCode();
    const mutated = `${code.slice(0, 6)}${code[6] === 'A' ? 'B' : 'A'}`;
    expect(validateCode(mutated)).toBe(false);
  });

  it('has very low collision probability', () => {
    const seen = new Set<string>();
    const SAMPLES = 4096;
    for (let i = 0; i < SAMPLES; i += 1) {
      const code = generateCode();
      expect(validateCode(code)).toBe(true);
      expect(seen.has(code)).toBe(false);
      seen.add(code);
    }
  });
});


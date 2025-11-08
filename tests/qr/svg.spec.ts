import { describe, expect, it } from 'vitest';

import { qrSvg } from '@shared/qr/svg';

const makeStr = (n: number) => 'A'.repeat(n);

function extractAttribute(svg: string, attr: string): string | null {
  const match = svg.match(new RegExp(`${attr}="([^"]+)"`));
  return match ? match[1] ?? null : null;
}

function countMoves(svg: string): number {
  return (svg.match(/M\d+/g) ?? []).length;
}

describe('qrSvg', () => {
  it('creates deterministic svg output', () => {
    const svgA = qrSvg('https://example.com/join/ABC1234');
    const svgB = qrSvg('https://example.com/join/ABC1234');
    expect(svgA).toBe(svgB);
    expect(svgA.startsWith('<?xml version="1.0"')).toBe(true);
    const width = extractAttribute(svgA, 'width');
    const height = extractAttribute(svgA, 'height');
    expect(width).toBe('147');
    expect(height).toBe('147');
    expect(countMoves(svgA)).toBeGreaterThan(0);
  });

  it('scales to requested size while preserving quiet zone', () => {
    const svg = qrSvg('join:golfiq', 256);
    const width = Number(extractAttribute(svg, 'width'));
    const viewBox = extractAttribute(svg, 'viewBox');
    expect(width).toBeGreaterThanOrEqual(196);
    expect(viewBox).toMatch(/^0 0 \d+ \d+$/);
    expect(countMoves(svg)).toBeGreaterThan(200);
  });

  it('rejects oversized payloads', () => {
    const long = 'a'.repeat(256);
    expect(() => qrSvg(long)).toThrow(/payload too large/);
  });
});

describe('qrSvg capacity (v6-M, byte mode)', () => {
  it('throws on empty data', () => {
    expect(() => qrSvg('')).toThrow(/data is required/i);
  });

  it('accepts payload at true max (≈106 bytes)', () => {
    const s = makeStr(106);
    const svg = qrSvg(s, 192);
    expect(svg.includes('<svg')).toBe(true);
    expect(svg.includes('</svg>')).toBe(true);
  });

  it('rejects payload just above max (107 bytes)', () => {
    const s = makeStr(107);
    expect(() => qrSvg(s, 192)).toThrow(/payload too large/i);
  });

  it('never overflows codeword capacity', () => {
    const s = makeStr(106);
    expect(() => qrSvg(s, 192)).not.toThrow();
  });
});


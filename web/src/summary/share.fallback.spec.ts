import { describe, it, expect } from 'vitest';

describe('share SVG fallback', () => {
  it('builds a valid data URI for SVG', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    expect(uri.startsWith('data:image/svg+xml')).toBe(true);
  });
});

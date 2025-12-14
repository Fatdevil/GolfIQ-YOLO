import { describe, expect, it } from 'vitest';
import { buildSgLightImpressionKey } from '@shared/sgLight/analytics';

describe('sg light analytics contract (mobile)', () => {
  it('builds recap summary keys', () => {
    expect(
      buildSgLightImpressionKey({
        surface: 'round_recap',
        contextId: 'round-abc',
        cardType: 'summary',
      }),
    ).toBe('sg_light:round_recap:round-abc:summary');
  });

  it('builds trend keys with focus category for round story', () => {
    expect(
      buildSgLightImpressionKey({
        surface: 'round_story',
        contextId: 'round-def',
        cardType: 'trend',
        focusCategory: 'approach',
      }),
    ).toBe('sg_light:round_story:round-def:trend:approach');
  });
});

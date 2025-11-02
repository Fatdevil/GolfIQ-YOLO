import { describe, expect, it } from 'vitest';

import { decodeSharedRoundV1, encodeSharedRoundV1, type SharedRoundV1 } from '../../shared/event/payload';

function sampleRound(overrides: Partial<SharedRoundV1> = {}): SharedRoundV1 {
  return {
    v: 1,
    roundId: 'round-123',
    player: { id: 'player-1', name: 'Alex', hcp: 4.2 },
    courseId: 'pine-valley',
    holes: { start: 1, end: 18 },
    gross: 74,
    net: 70,
    sg: 1.8,
    holesBreakdown: Array.from({ length: 18 }, (_, idx) => ({
      h: idx + 1,
      strokes: idx === 0 ? 5 : 4,
      net: idx === 0 ? 1 : 0,
      sg: 0.1,
    })),
    ...overrides,
  };
}

describe('Shared round payload encoding', () => {
  it('round-trips encode/decode', () => {
    const payload = sampleRound();
    const encoded = encodeSharedRoundV1(payload);
    expect(encoded).toBeTypeOf('string');
    const decoded = decodeSharedRoundV1(encoded);
    expect(decoded).toEqual(payload);
  });

  it('ignores extra fields when decoding', () => {
    const payload = {
      ...sampleRound(),
      unexpected: 'value',
      player: {
        ...sampleRound().player,
        nickname: 'Champ',
      },
      holesBreakdown: sampleRound().holesBreakdown.map((hole) => ({
        ...hole,
        extra: true,
      })),
    } as unknown as SharedRoundV1;
    const encoded = encodeSharedRoundV1(payload);
    const decoded = decodeSharedRoundV1(encoded);
    expect(decoded.player).toEqual({ id: 'player-1', name: 'Alex', hcp: 4.2 });
    decoded.holesBreakdown.forEach((hole) => {
      expect(hole).not.toHaveProperty('extra');
    });
  });

  it('throws on malformed payloads', () => {
    expect(() => decodeSharedRoundV1('')).toThrowError();
    expect(() => decodeSharedRoundV1('{invalid json')).toThrowError();
    expect(() => decodeSharedRoundV1(encodeURI('{"v":2}'))).toThrowError();
    expect(() => decodeSharedRoundV1(encodeURI('{"v":1,"roundId":"","courseId":""}'))).toThrowError();
  });
});


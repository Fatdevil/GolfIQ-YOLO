import { describe, expect, it } from 'vitest';

import { decodeSharedRoundV1, encodeSharedRoundV1, type SharedRoundV1 } from '../../../../shared/event/payload';

describe('shared/event payload (web)', () => {
  it('encodes and decodes round payload on web runtime', () => {
    const payload: SharedRoundV1 = {
      v: 1,
      roundId: 'web-round',
      player: { id: 'p1', name: 'Web Player' },
      courseId: 'web-course',
      holes: { start: 1, end: 9 },
      gross: 36,
      sg: 0.5,
      holesBreakdown: Array.from({ length: 9 }, (_, idx) => ({
        h: idx + 1,
        strokes: 4,
        sg: 0.05,
      })),
    };
    const encoded = encodeSharedRoundV1(payload);
    const decoded = decodeSharedRoundV1(encoded);
    expect(decoded).toEqual(payload);
  });
});


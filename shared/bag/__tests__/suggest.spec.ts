import { describe, expect, it } from 'vitest';

import type { BagStats, ClubStats } from '../types';
import { approachSuggestion, nextTeeSuggestion } from '../suggest';

function makeClub(partial: Partial<ClubStats>): ClubStats {
  return {
    club: partial.club ?? '7i',
    samples: partial.samples ?? 6,
    meanCarry_m: partial.meanCarry_m ?? 150,
    p25_m: partial.p25_m ?? 145,
    p50_m: partial.p50_m ?? 150,
    p75_m: partial.p75_m ?? 155,
    std_m: partial.std_m ?? 5,
    sgPerShot: partial.sgPerShot ?? 0,
  } satisfies ClubStats;
}

const SYNTH_BAG: BagStats = {
  updatedAt: 0,
  clubs: {
    D: makeClub({ club: 'D', p25_m: 230, p50_m: 240, p75_m: 255 }),
    '3W': makeClub({ club: '3W', p25_m: 210, p50_m: 220, p75_m: 232 }),
    '5i': makeClub({ club: '5i', p25_m: 170, p50_m: 180, p75_m: 188 }),
    '7i': makeClub({ club: '7i', p25_m: 150, p50_m: 160, p75_m: 168 }),
    '9i': makeClub({ club: '9i', p25_m: 130, p50_m: 138, p75_m: 144 }),
    Putter: makeClub({ club: 'Putter', p25_m: 5, p50_m: 6, p75_m: 7 }),
  },
};

describe('bag suggestions', () => {
  it('selects driver for longer tee when yardage present', () => {
    const suggestion = nextTeeSuggestion({ bag: SYNTH_BAG, holePar: 5, nextHoleYardage_m: 235 });
    expect(suggestion).not.toBeNull();
    expect(suggestion?.club).toBe('D');
    expect(suggestion?.p75_m).toBeCloseTo(255, 5);
  });

  it('selects middle iron for par 3 without yardage', () => {
    const suggestion = nextTeeSuggestion({ bag: SYNTH_BAG, holePar: 3 });
    expect(suggestion).not.toBeNull();
    expect(suggestion?.club).toBe('9i');
  });

  it('returns null when insufficient data', () => {
    const empty: BagStats = { updatedAt: 0, clubs: {} };
    expect(nextTeeSuggestion({ bag: empty, holePar: 4 })).toBeNull();
    expect(approachSuggestion({ bag: empty, distanceToPin_m: 140 })).toBeNull();
  });

  it('selects closest club for approaches', () => {
    const suggestion = approachSuggestion({ bag: SYNTH_BAG, distanceToPin_m: 167 });
    expect(suggestion).not.toBeNull();
    expect(suggestion?.club).toBe('7i');
    expect(suggestion?.p25_m).toBeCloseTo(150, 5);
  });

  it('ignores putter', () => {
    const bag: BagStats = {
      updatedAt: 0,
      clubs: {
        Putter: makeClub({ club: 'Putter', samples: 20, p25_m: 2, p50_m: 3, p75_m: 4 }),
      },
    };
    expect(nextTeeSuggestion({ bag, holePar: 4 })).toBeNull();
  });
});

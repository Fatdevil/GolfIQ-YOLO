import { describe, expect, it } from 'vitest';

import type { RoundState, ShotEvent } from '@shared/round/types';
import { __computeDiffForTests } from '@shared/round/recorder';

function shot(id: string, hole: number, seq: number): ShotEvent {
  return {
    id,
    hole,
    seq,
    kind: 'Full',
    start: { lat: 0, lon: 0, ts: 1_000 + seq },
    startLie: 'Fairway',
  } as ShotEvent;
}

function roundWithShots(shots: ShotEvent[]): RoundState {
  return {
    id: 'round-1',
    courseId: 'course-1',
    startedAt: 1_000,
    currentHole: 1,
    holes: {
      1: {
        hole: 1,
        par: 4,
        shots,
      },
    },
    tournamentSafe: false,
  } as RoundState;
}

describe('round diff deletions', () => {
  it('flags removed shots by key', () => {
    const previous = roundWithShots([shot('shot-a', 1, 1), shot('shot-b', 1, 2)]);
    const next = roundWithShots([shot('shot-a', 1, 1)]);

    const diff = __computeDiffForTests(previous, next);

    expect(diff.removedShots).toEqual(['id:shot-b']);
    expect(diff.roundChanged).toBe(true);
    expect(diff.removed).toBe(true);
  });

  it('detects metadata-only changes without removals', () => {
    const previous = roundWithShots([shot('shot-a', 1, 1)]);
    const next: RoundState = {
      ...roundWithShots([shot('shot-a', 1, 1)]),
      holes: {
        1: {
          hole: 1,
          par: 5,
          shots: [shot('shot-a', 1, 1)],
        },
      },
    } as RoundState;

    const diff = __computeDiffForTests(previous, next);

    expect(diff.removedShots).toHaveLength(0);
    expect(diff.roundChanged).toBe(true);
    expect(diff.removed).toBe(false);
  });
});

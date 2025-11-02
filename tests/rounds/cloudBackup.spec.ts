import { beforeEach, describe, expect, it } from 'vitest';

import type { RoundSummary } from '../../shared/round/summary';
import type { RoundState } from '../../shared/round/types';
import { pushRound, listRounds } from '../../golfiq/app/src/cloud/roundsSync';
import { __resetMockSupabase, __setMockUser } from '../../golfiq/app/src/cloud/mockSupabase';

describe('rounds cloud backup (mock backend)', () => {
  beforeEach(() => {
    __resetMockSupabase();
    __setMockUser('golfer');
  });

  it('stores round summary and lists it back', async () => {
    const round: RoundState = {
      id: 'round-1',
      courseId: 'course-42',
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_360_000,
      holes: {},
      currentHole: 18,
      tournamentSafe: false,
    };
    const summary: RoundSummary = {
      strokes: 72,
      toPar: 0,
      putts: 30,
      penalties: 2,
      firPct: 0.5,
      girPct: 0.6,
      phases: { ott: 0.8, app: -0.3, arg: 0.1, putt: -0.2, total: 0.4 },
      clubs: [],
      holes: [
        { hole: 1, par: 4, strokes: 4, putts: 2, gir: true, fir: true, sg: 0.1 },
      ],
    };

    await pushRound(round, summary);

    const rows = await listRounds();
    expect(rows).toHaveLength(1);
    const stored = rows[0];
    expect(stored.id).toBe(round.id);
    expect(stored.courseId).toBe(round.courseId);
    expect(stored.summary.strokes).toBe(72);
    expect(stored.summary.sg.total).toBe(summary.phases.total);
    expect(stored.summary.firPct).toBe(summary.firPct);
    expect(stored.summary.girPct).toBe(summary.girPct);
  });
});

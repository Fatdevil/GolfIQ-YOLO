import { describe, expect, it } from 'vitest';

import { buildRoundSummary } from '../summary';
import type { RoundState, ShotEvent } from '../types';
import { loadDefaultBaselines } from '../../sg/baseline';
import { render as renderShareCard } from '../../../golfiq/app/src/components/summary/ShareCard';

const baselines = loadDefaultBaselines();

function shot(partial: Partial<ShotEvent> & Pick<ShotEvent, 'hole' | 'seq'>): ShotEvent {
  return {
    id: `shot-${partial.hole}-${partial.seq}`,
    start: { lat: 0, lon: 0, ts: 0 },
    kind: 'Full',
    startLie: 'Fairway',
    ...partial,
  } as ShotEvent;
}

describe('buildRoundSummary', () => {
  it('aggregates strokes gained, clubs, and holes', () => {
    const round: RoundState = {
      id: 'round-1',
      courseId: 'test-course',
      startedAt: 1000,
      currentHole: 1,
      tournamentSafe: false,
      holes: {
        1: {
          hole: 1,
          par: 4,
          shots: [
            shot({
              hole: 1,
              seq: 1,
              startLie: 'Tee',
              endLie: 'Fairway',
              end: { lat: 0, lon: 0.001, ts: 1 },
              club: 'Driver',
              kind: 'Full',
              carry_m: 240,
              sg: 0.5,
            }),
            shot({
              hole: 1,
              seq: 2,
              startLie: 'Fairway',
              endLie: 'Rough',
              end: { lat: 0.0004, lon: 0.0012, ts: 2 },
              club: '7i',
              kind: 'Full',
              carry_m: 150,
              sg: -0.2,
            }),
            shot({
              hole: 1,
              seq: 3,
              startLie: 'Rough',
              endLie: 'Green',
              end: { lat: 0.0005, lon: 0.0013, ts: 3 },
              club: 'Wedge',
              kind: 'Chip',
              carry_m: 15,
              sg: 0.1,
            }),
            shot({
              hole: 1,
              seq: 4,
              startLie: 'Green',
              endLie: 'Green',
              end: { lat: 0.00051, lon: 0.00131, ts: 4 },
              club: 'Putter',
              kind: 'Putt',
              sg: 0.25,
            }),
            shot({
              hole: 1,
              seq: 5,
              startLie: 'Penalty',
              endLie: 'Rough',
              end: { lat: 0.00045, lon: 0.00115, ts: 5 },
              kind: 'Penalty',
              sg: -1,
            }),
          ],
          metrics: { fir: true, gir: false, reachedGreenAt: 3 },
        },
        2: {
          hole: 2,
          par: 3,
          shots: [
            shot({
              hole: 2,
              seq: 1,
              startLie: 'Tee',
              endLie: 'Green',
              end: { lat: 0.0008, lon: 0.0016, ts: 6 },
              club: '5i',
              kind: 'Full',
              carry_m: 170,
              sg: 0.3,
            }),
            shot({
              hole: 2,
              seq: 2,
              startLie: 'Green',
              endLie: 'Green',
              end: { lat: 0.00081, lon: 0.00161, ts: 7 },
              club: 'Putter',
              kind: 'Putt',
              sg: -0.05,
            }),
          ],
          metrics: { fir: null, gir: true, reachedGreenAt: 1 },
        },
      },
    };

    const summary = buildRoundSummary(round, baselines);

    expect(summary.strokes).toBe(7);
    expect(summary.putts).toBe(2);
    expect(summary.penalties).toBe(1);
    expect(summary.toPar).toBe(0);
    expect(summary.phases.total).toBeCloseTo(-0.1, 1e-6);
    expect(summary.phases.ott).toBeCloseTo(0.8, 1e-6);
    expect(summary.phases.app).toBeCloseTo(-1.2, 1e-6);
    expect(summary.phases.arg).toBeCloseTo(0.1, 1e-6);
    expect(summary.phases.putt).toBeCloseTo(0.2, 1e-6);
    expect(summary.firPct).toBe(1);
    expect(summary.girPct).toBe(0.5);

    const driver = summary.clubs.find((row) => row.club === 'Driver');
    expect(driver?.shots).toBe(1);
    expect(driver?.avgCarry_m).toBeCloseTo(240, 1e-6);
    expect(driver?.sgPerShot).toBeCloseTo(0.5, 1e-6);

    const holeOne = summary.holes.find((row) => row.hole === 1);
    expect(holeOne?.sg).toBeCloseTo(-0.35, 1e-6);
    expect(holeOne?.fir).toBe(true);
    expect(holeOne?.gir).toBe(false);

    const holeTwo = summary.holes.find((row) => row.hole === 2);
    expect(holeTwo?.gir).toBe(true);
    expect(holeTwo?.fir).toBeNull();
  });

  it('renders share card SVG with phase labels', () => {
    const round: RoundState = {
      id: 'round-1',
      courseId: 'test-course',
      startedAt: 1000,
      currentHole: 1,
      tournamentSafe: true,
      holes: {},
    };
    const summary: ReturnType<typeof buildRoundSummary> = {
      strokes: 0,
      toPar: null,
      putts: 0,
      penalties: 0,
      firPct: null,
      girPct: null,
      phases: { ott: 0, app: 0, arg: 0, putt: 0, total: 0 },
      clubs: [],
      holes: [],
    };

    const svg = renderShareCard(summary, {
      courseId: round.courseId,
      courseName: 'Test Course',
      startedAt: round.startedAt,
      finishedAt: round.startedAt + 10_000,
      holeCount: 18,
      tournamentSafe: round.tournamentSafe,
    });

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.includes('Total SG')).toBe(true);
    expect(svg.includes('OTT')).toBe(true);
    expect(svg.includes('APP')).toBe(true);
    expect(svg.includes('ARG')).toBe(true);
    expect(svg.includes('PUTT')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import type { RoundState, ShotEvent } from '../../round/types';
import { buildBagStats, getClubSamples, interquartileRange, median, medianAbsoluteDeviation, quantile, standardDeviation } from '../derive';

function makeShot(partial: Partial<ShotEvent>): ShotEvent {
  return {
    id: partial.id ?? `shot-${Math.random()}`,
    hole: partial.hole ?? 1,
    seq: partial.seq ?? 1,
    start: partial.start ?? { lat: 0, lon: 0, ts: Date.now() },
    startLie: partial.startLie ?? 'Fairway',
    kind: partial.kind ?? 'Full',
    ...partial,
  } as ShotEvent;
}

function buildRound(shots: ShotEvent[]): RoundState {
  return {
    id: 'round-1',
    courseId: 'test-course',
    startedAt: Date.now(),
    currentHole: 1,
    tournamentSafe: false,
    holes: {
      1: {
        hole: 1,
        par: 4,
        shots,
      },
    },
  } satisfies RoundState;
}

describe('stat helpers', () => {
  it('computes quantiles using nearest-rank', () => {
    expect(quantile([], 25)).toBeNull();
    expect(quantile([100], 25)).toBe(100);
    expect(quantile([1, 2, 3, 4], 25)).toBe(1);
    expect(quantile([1, 2, 3, 4], 50)).toBe(2);
    expect(quantile([1, 2, 3, 4], 75)).toBe(3);
    expect(quantile([1, 2, 3, 4], 90)).toBe(4);
  });

  it('computes median, IQR and MAD', () => {
    const values = [120, 130, 140, 160, 220];
    expect(median(values)).toBe(140);
    const iqr = interquartileRange(values);
    expect(iqr).not.toBeNull();
    expect(iqr?.q1).toBe(130);
    expect(iqr?.q3).toBe(160);
    expect(iqr?.iqr).toBe(30);
    const mad = medianAbsoluteDeviation(values);
    expect(mad).toBe(20);
  });

  it('computes sample standard deviation', () => {
    expect(standardDeviation([])).toBeNull();
    expect(standardDeviation([150])).toBe(0);
    const std = standardDeviation([140, 150, 160, 180]);
    expect(std).toBeCloseTo(17.078, 3);
  });
});

describe('buildBagStats', () => {
  const baseShots: ShotEvent[] = [
    makeShot({
      id: 'a',
      seq: 1,
      club: '7i',
      carry_m: 150,
      startLie: 'Fairway',
      sg: 0.1,
      kind: 'Full',
    }),
    makeShot({
      id: 'b',
      seq: 2,
      club: '7i',
      carry_m: 147,
      startLie: 'Rough',
      sg: 0.05,
      kind: 'Full',
    }),
    makeShot({
      id: 'c',
      seq: 3,
      club: '7i',
      carry_m: 210,
      startLie: 'Fairway',
      sg: -1.2,
      kind: 'Full',
    }),
    makeShot({
      id: 'd',
      seq: 4,
      club: '7i',
      carry_m: 152,
      startLie: 'Fairway',
      sg: 0.05,
      kind: 'Full',
      playsLikePct: 6,
    }),
    makeShot({
      id: 'e',
      seq: 5,
      club: '7i',
      carry_m: 148,
      startLie: 'Fairway',
      sg: 0.2,
      kind: 'Full',
      playsLikePct: -5,
    }),
    makeShot({
      id: 'f',
      seq: 6,
      club: 'PW',
      carry_m: 120,
      startLie: 'Fairway',
      sg: 0.05,
      kind: 'Full',
    }),
    makeShot({
      id: 'g',
      seq: 7,
      club: 'PW',
      carry_m: 60,
      startLie: 'Green',
      sg: 0.05,
      kind: 'Chip',
    }),
    makeShot({
      id: 'h',
      seq: 8,
      club: 'PW',
      carry_m: 10,
      startLie: 'Green',
      kind: 'Chip',
    }),
    makeShot({
      id: 'i',
      seq: 9,
      club: 'PW',
      carry_m: 300,
      startLie: 'Fairway',
      kind: 'Full',
    }),
  ];

  it('trims outliers and neutralizes carries', () => {
    const round = buildRound(baseShots);
    const stats = buildBagStats([round], { updatedAt: 123456 });
    const samples = getClubSamples([round]);
    expect(stats.updatedAt).toBe(123456);
    const sevenIron = stats.clubs['7i'];
    expect(sevenIron.samples).toBe(4);
    expect(sevenIron.meanCarry_m).toBeGreaterThan(145);
    expect(sevenIron.meanCarry_m).toBeLessThan(152);
    expect(sevenIron.p50_m).toBeGreaterThan(145);
    expect(samples['7i'].usage.approach).toBe(3);
    expect(samples['7i'].usage.outliers).toBe(1);
    const pw = stats.clubs['PW'];
    expect(pw.samples).toBe(2);
    expect(pw.p25_m).toBeGreaterThan(55);
    expect(pw.p75_m).toBeLessThan(130);
  });

  it('ignores invalid shots and supports sg aggregation', () => {
    const extraShots = [
      makeShot({ id: 'x', club: '7i', carry_m: 0, kind: 'Full' }),
      makeShot({ id: 'y', club: '7i', carry_m: 140, kind: 'Putt' }),
      makeShot({ id: 'z', carry_m: 150, kind: 'Full' }),
    ];
    const round = buildRound([...baseShots, ...extraShots]);
    const bag = buildBagStats([round], { updatedAt: 0 });
    const sevenIron = bag.clubs['7i'];
    expect(sevenIron.samples).toBe(4);
    expect(sevenIron.sgPerShot).toBeCloseTo(0.1, 2);
  });
});

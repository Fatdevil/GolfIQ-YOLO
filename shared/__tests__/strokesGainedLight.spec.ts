import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STROKES_GAINED_BASELINE,
  computeStrokesGainedLight,
  deriveStrokesGainedLightFocusCategory,
  buildStrokesGainedLightTrend,
  type StrokesGainedLightCategory,
} from '../stats/strokesGainedLight';
import type { ShotEvent } from '../round/types';

const baseShot: ShotEvent = {
  id: 's1',
  hole: 1,
  seq: 1,
  start: { lat: 0, lon: 0, ts: 0 },
  startLie: 'Tee',
  kind: 'Full',
};

describe('computeStrokesGainedLight', () => {
  it('returns zeros when missing data', () => {
    const result = computeStrokesGainedLight([], DEFAULT_STROKES_GAINED_BASELINE);
    expect(result.totalDelta).toBe(0);
    expect(result.byCategory).toEqual([]);
  });

  it('buckets tee shots by par', () => {
    const shots: ShotEvent[] = [
      { ...baseShot, toPinStart_m: 380 },
      { ...baseShot, id: 's2', hole: 2, seq: 1, toPinStart_m: 520 },
    ];

    const result = computeStrokesGainedLight(shots, DEFAULT_STROKES_GAINED_BASELINE, {
      1: 4,
      2: 5,
    });

    const tee = result.byCategory.find((c) => c.category === 'tee');
    expect(tee?.shots).toBe(2);
    expect(result.totalDelta).toBeLessThan(0); // two strokes taken from tee positions
  });

  it('treats close lies as short game and greens as putting', () => {
    const shots: ShotEvent[] = [
      {
        ...baseShot,
        id: 'app1',
        startLie: 'Fairway',
        toPinStart_m: 120,
        toPinEnd_m: 8,
      },
      {
        ...baseShot,
        id: 'chip',
        startLie: 'Rough',
        toPinStart_m: 15,
        toPinEnd_m: 3,
        kind: 'Chip',
      },
      {
        ...baseShot,
        id: 'putt',
        startLie: 'Green',
        toPinStart_m: 4,
        toPinEnd_m: 0,
        kind: 'Putt',
      },
    ];

    const result = computeStrokesGainedLight(shots, DEFAULT_STROKES_GAINED_BASELINE);
    const app = result.byCategory.find((c) => c.category === 'approach');
    const shortGame = result.byCategory.find((c) => c.category === 'short_game');
    const putting = result.byCategory.find((c) => c.category === 'putting');

    expect(app?.shots).toBe(1);
    expect(shortGame?.shots).toBe(1);
    expect(putting?.shots).toBe(1);
  });

  it('assigns short-game shots to the correct distance buckets', () => {
    const shotAt4m: ShotEvent = {
      ...baseShot,
      id: 'chip-4m',
      startLie: 'Rough',
      toPinStart_m: 4,
      toPinEnd_m: 0,
    };
    const shotAt10m: ShotEvent = {
      ...baseShot,
      id: 'chip-10m',
      startLie: 'Rough',
      toPinStart_m: 10,
      toPinEnd_m: 0,
    };
    const shotAt18m: ShotEvent = {
      ...baseShot,
      id: 'chip-18m',
      startLie: 'Rough',
      toPinStart_m: 18,
      toPinEnd_m: 0,
    };

    const deltaForShot = (shot: ShotEvent) => {
      const result = computeStrokesGainedLight([shot], DEFAULT_STROKES_GAINED_BASELINE);
      return result.byCategory.find((c) => c.category === 'short_game')?.delta ?? 0;
    };

    // Expected strokes for 0-15m short game shots is 1.5
    expect(deltaForShot(shotAt4m)).toBeCloseTo(0.5, 5);
    expect(deltaForShot(shotAt10m)).toBeCloseTo(0.5, 5);

    // Expected strokes for 15-30m short game shots is 1.8
    expect(deltaForShot(shotAt18m)).toBeCloseTo(0.8, 5);
  });

  it('counts penalty strokes as losses instead of skipping them', () => {
    const holePars = { 1: 4 };
    const baselineShots: ShotEvent[] = [
      { ...baseShot, toPinStart_m: 380, toPinEnd_m: 150 },
      {
        ...baseShot,
        id: 'app',
        seq: 2,
        startLie: 'Fairway',
        toPinStart_m: 150,
        toPinEnd_m: 5,
      },
      {
        ...baseShot,
        id: 'putt',
        seq: 3,
        startLie: 'Green',
        toPinStart_m: 5,
        toPinEnd_m: 0,
        kind: 'Putt',
      },
    ];

    const withPenalty: ShotEvent[] = [
      { ...baseShot, toPinStart_m: 380, toPinEnd_m: 200 },
      {
        ...baseShot,
        id: 'pen',
        seq: 2,
        startLie: 'Penalty',
        endLie: 'Fairway',
        kind: 'Penalty',
        toPinStart_m: 200,
        toPinEnd_m: 180,
      },
      {
        ...baseShot,
        id: 'app_after_pen',
        seq: 3,
        startLie: 'Fairway',
        toPinStart_m: 180,
        toPinEnd_m: 5,
      },
      {
        ...baseShot,
        id: 'putt_after_pen',
        seq: 4,
        startLie: 'Green',
        toPinStart_m: 5,
        toPinEnd_m: 0,
        kind: 'Putt',
      },
    ];

    const baseResult = computeStrokesGainedLight(
      baselineShots,
      DEFAULT_STROKES_GAINED_BASELINE,
      holePars,
    );
    const penaltyResult = computeStrokesGainedLight(
      withPenalty,
      DEFAULT_STROKES_GAINED_BASELINE,
      holePars,
    );

    expect(penaltyResult.totalDelta).toBeLessThan(baseResult.totalDelta);
    const approachDelta = penaltyResult.byCategory.find((c) => c.category === 'approach')?.delta;
    expect(approachDelta).toBeLessThan(0);
  });

  it('exposes a focus category when the worst delta is confident enough', () => {
    const summary = computeStrokesGainedLight(
      [
        { ...baseShot, toPinStart_m: 380, toPinEnd_m: 180 },
        {
          ...baseShot,
          id: 'app',
          startLie: 'Fairway',
          seq: 2,
          toPinStart_m: 150,
          // poor shot that ends farther from the hole
          toPinEnd_m: 200,
        },
        {
          ...baseShot,
          id: 'app-2',
          startLie: 'Fairway',
          seq: 3,
          toPinStart_m: 140,
          toPinEnd_m: 190,
        },
        {
          ...baseShot,
          id: 'app-3',
          startLie: 'Fairway',
          seq: 4,
          toPinStart_m: 130,
          toPinEnd_m: 180,
        },
        { ...baseShot, id: 'chip', startLie: 'Rough', seq: 5, toPinStart_m: 10, toPinEnd_m: 2 },
      ],
      DEFAULT_STROKES_GAINED_BASELINE,
    );

    expect(summary.focusCategory).toBe('approach');
  });
});

describe('deriveStrokesGainedLightFocusCategory', () => {
  it('returns null when data is missing or below threshold', () => {
    expect(
      deriveStrokesGainedLightFocusCategory({ totalDelta: 0, byCategory: [] } as any),
    ).toBeNull();

    expect(
      deriveStrokesGainedLightFocusCategory({
        totalDelta: 0,
        byCategory: [
          { category: 'tee', shots: 1, delta: -0.1, confidence: 0.5 },
          { category: 'approach', shots: 1, delta: 0.5, confidence: 0.2 },
        ],
      }),
    ).toBeNull();
  });

  it('picks the most negative confident category', () => {
    const focus = deriveStrokesGainedLightFocusCategory({
      totalDelta: -0.4,
      byCategory: [
        { category: 'tee', shots: 5, delta: -0.25, confidence: 0.6 },
        { category: 'approach', shots: 8, delta: -0.4, confidence: 0.7 },
        { category: 'short_game', shots: 4, delta: 0.3, confidence: 0.9 },
      ],
    });

    expect(focus).toBe('approach');
  });

  it('ignores small negatives when stronger positives exist', () => {
    const focus = deriveStrokesGainedLightFocusCategory({
      totalDelta: 0.6,
      byCategory: [
        { category: 'tee', shots: 10, delta: 0.6, confidence: 0.9 },
        { category: 'putting', shots: 20, delta: -0.15, confidence: 0.8 },
      ],
    });

    expect(focus).toBeNull();
  });

  it('ignores low-confidence categories', () => {
    const focus = deriveStrokesGainedLightFocusCategory({
      totalDelta: -0.3,
      byCategory: [
        { category: 'tee', shots: 1, delta: -0.5, confidence: 0.1 },
        { category: 'approach', shots: 8, delta: -0.25, confidence: 0.9 },
      ],
    });

    expect(focus).toBe('approach');
  });
});

describe('buildStrokesGainedLightTrend', () => {
  const baseByCategory = (
    values: Partial<Record<StrokesGainedLightCategory, { delta?: number; confidence?: number }>> = {},
  ) => (
    ['tee', 'approach', 'short_game', 'putting'] as StrokesGainedLightCategory[]
  ).map((category) => ({
    category,
    shots: 4,
    delta: values[category]?.delta ?? 0.2,
    confidence: values[category]?.confidence ?? 0.8,
  }));

  const makeRound = (overrides: {
    id: string;
    date: string;
    byCategory?: ReturnType<typeof baseByCategory>;
    focusCategory?: StrokesGainedLightCategory | null;
  }) => ({
    roundId: overrides.id,
    playedAt: overrides.date,
    totalDelta: 0,
    byCategory: overrides.byCategory ?? baseByCategory(),
    focusCategory: overrides.focusCategory,
  });

  it('averages per-category deltas across the window', () => {
    const rounds = [
      makeRound({ id: 'r1', date: '2024-01-05', byCategory: baseByCategory({ tee: { delta: 0.6 } }) }),
      makeRound({ id: 'r2', date: '2024-01-02', byCategory: baseByCategory({ tee: { delta: -0.3 } }) }),
      makeRound({ id: 'r3', date: '2023-12-20', byCategory: baseByCategory({ tee: { delta: 0 } }) }),
    ];

    const trend = buildStrokesGainedLightTrend(rounds, { windowSize: 5 });

    expect(trend?.windowSize).toBe(3);
    expect(trend?.perCategory.tee.avgDelta).toBeCloseTo((0.6 - 0.3 + 0) / 3, 6);
    expect(trend?.perCategory.approach.rounds).toBe(3);
  });

  it('derives focus history using the focus selector', () => {
    const rounds = [
      makeRound({
        id: 'latest',
        date: '2024-02-10',
        byCategory: baseByCategory({ approach: { delta: -0.5 } }),
        focusCategory: null,
      }),
      makeRound({
        id: 'older',
        date: '2024-02-03',
        byCategory: baseByCategory({ tee: { delta: -0.4 }, putting: { delta: 0.8 } }),
        focusCategory: 'tee',
      }),
    ];

    const trend = buildStrokesGainedLightTrend(rounds, { windowSize: 3 });

    expect(trend?.focusHistory[0]).toEqual(
      expect.objectContaining({ roundId: 'latest', focusCategory: 'approach' }),
    );
    expect(trend?.focusHistory[1]).toEqual(
      expect.objectContaining({ roundId: 'older', focusCategory: 'tee' }),
    );
  });

  it('returns null when fewer than two valid rounds are present', () => {
    const rounds = [
      makeRound({
        id: 'low-confidence',
        date: '2024-01-10',
        byCategory: baseByCategory({ tee: { confidence: 0.1 } }),
      }),
      makeRound({ id: 'only-one', date: '2024-01-08' }),
    ];

    const trend = buildStrokesGainedLightTrend(rounds, { windowSize: 2 });
    expect(trend).toBeNull();
  });

  it('ignores rounds without SG Light data and signals no trend', () => {
    const rounds = [
      makeRound({ id: 'missing', date: '2024-03-01', byCategory: [] as any }),
      makeRound({
        id: 'valid',
        date: '2024-02-20',
        byCategory: baseByCategory({ approach: { delta: -0.4 } }),
      }),
    ];

    const trend = buildStrokesGainedLightTrend(rounds, { windowSize: 5 });

    expect(trend).toBeNull();
  });
});


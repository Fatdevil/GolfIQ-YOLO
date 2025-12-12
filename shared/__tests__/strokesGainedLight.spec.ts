import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STROKES_GAINED_BASELINE,
  computeStrokesGainedLight,
  deriveStrokesGainedLightFocusCategory,
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


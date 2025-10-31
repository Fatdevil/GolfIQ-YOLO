import { describe, expect, it } from 'vitest';

import { loadDefaultBaselines } from '../../../shared/sg/baseline';
import {
  HOLE_SG_INVALID,
  classifyPhase,
  holeSG,
  isHoleSGInvalid,
  type Phase,
  type ShotEvent,
} from '../../../shared/sg/hole';

describe('classifyPhase (multi-lie)', () => {
  it('respects tee and putting lies first', () => {
    expect(classifyPhase('tee', 420)).toBe('Tee');
    expect(classifyPhase('green', 12)).toBe('Putting');
  });

  it('uses short-game threshold for tight lies', () => {
    expect(classifyPhase('fairway', 25)).toBe('ShortGame');
    expect(classifyPhase('rough', 30)).toBe('ShortGame');
    expect(classifyPhase('sand', 40)).toBe('Approach');
    expect(classifyPhase('recovery', 42)).toBe('Approach');
  });
});

describe('holeSG', () => {
  const baselines = loadDefaultBaselines();

  const expectPhaseSum = (phases: Record<Phase, number>, total: number) => {
    const sum = phases.Tee + phases.Approach + phases.ShortGame + phases.Putting;
    expect(sum).toBeCloseTo(total, 6);
  };

  it('computes two-shot fairway-to-green sequences', () => {
    const shots: ShotEvent[] = [
      { start_m: 150, end_m: 3, startLie: 'fairway', endLie: 'green', holed: false },
      { start_m: 3, end_m: 0, startLie: 'green', endLie: 'green', holed: true },
    ];

    const result = holeSG(shots, baselines);

    const first = baselines.fairway(150) - 1 - baselines.green(3);
    const second = baselines.green(3) - 1 - 0;

    expect(result.total).toBeCloseTo(first + second, 6);
    expect(result.byPhase.Approach).toBeCloseTo(first, 6);
    expect(result.byPhase.Putting).toBeCloseTo(second, 6);
    expect(result.shots).toHaveLength(2);
    expectPhaseSum(result.byPhase, result.total);
    expect(isHoleSGInvalid(result)).toBe(false);
  });

  it('handles short-game chips that finish on the green', () => {
    const shots: ShotEvent[] = [
      { start_m: 25, end_m: 1.2, startLie: 'rough', endLie: 'green', holed: false },
      { start_m: 1.2, end_m: 0, startLie: 'green', endLie: 'green', holed: true },
    ];

    const result = holeSG(shots, baselines);

    const chip = baselines.rough(25) - 1 - baselines.green(1.2);
    const putt = baselines.green(1.2) - 1;

    expect(result.byPhase.ShortGame).toBeCloseTo(chip, 6);
    expect(result.byPhase.Putting).toBeCloseTo(putt, 6);
    expect(result.total).toBeCloseTo(chip + putt, 6);
    expectPhaseSum(result.byPhase, result.total);
  });

  it('aggregates tee, approach, short game, and putting phases', () => {
    const shots: ShotEvent[] = [
      { start_m: 380, end_m: 90, startLie: 'tee', endLie: 'rough', holed: false },
      { start_m: 90, end_m: 12, startLie: 'rough', endLie: 'sand', holed: false },
      { start_m: 12, end_m: 2, startLie: 'sand', endLie: 'green', holed: false },
      { start_m: 2, end_m: 0, startLie: 'green', endLie: 'green', holed: true },
    ];

    const result = holeSG(shots, baselines);

    expect(result.shots).toHaveLength(4);
    expect(result.byPhase.Tee).toBeCloseTo(baselines.tee(380) - 1 - baselines.rough(90), 6);
    expect(result.byPhase.Approach).toBeCloseTo(baselines.rough(90) - 1 - baselines.sand(12), 6);
    expect(result.byPhase.ShortGame).toBeCloseTo(baselines.sand(12) - 1 - baselines.green(2), 6);
    expect(result.byPhase.Putting).toBeCloseTo(baselines.green(2) - 1, 6);
    expectPhaseSum(result.byPhase, result.total);
  });

  it('flags invalid sequences without throwing', () => {
    const invalid: ShotEvent[] = [
      { start_m: 100, end_m: 120, startLie: 'fairway', endLie: 'rough', holed: false },
    ];

    const result = holeSG(invalid, baselines);
    expect(result.total).toBe(0);
    expect(result.shots).toHaveLength(0);
    expect((result as Record<symbol, boolean>)[HOLE_SG_INVALID]).toBe(true);
    expect(isHoleSGInvalid(result)).toBe(true);
  });

  it('returns zeros when the hole is not marked holed', () => {
    const incomplete: ShotEvent[] = [
      { start_m: 150, end_m: 20, startLie: 'fairway', endLie: 'rough', holed: false },
      { start_m: 20, end_m: 5, startLie: 'rough', endLie: 'green', holed: false },
    ];

    const result = holeSG(incomplete, baselines);
    expect(result.total).toBe(0);
    expect(result.shots).toHaveLength(0);
    expect(isHoleSGInvalid(result)).toBe(true);
  });
});

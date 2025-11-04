import { describe, expect, it } from 'vitest';

import { chooseStrategy, scoreEV, type StrategyDecision, type StrategyInput } from '../../../../shared/caddie/strategy';
import { STRATEGY_DEFAULTS } from '../../../../shared/caddie/strategy_profiles';

const baseInput: StrategyInput = {
  rawDist_m: 150,
  playsLikeFactor: 1,
  hazard: { water: 0.12, bunker: 0.05, rough: 0.18, ob: 0.03, fairway: 0.52 },
  dispersion: { sigma_m: 12, lateralSigma_m: 7 },
  laneWidth_m: 28,
  profile: 'neutral',
  dangerSide: 'left',
};

const compute = (overrides: Partial<StrategyInput> = {}): StrategyDecision =>
  chooseStrategy({ ...baseInput, ...overrides, hazard: { ...baseInput.hazard, ...overrides.hazard } });

describe('caddie strategy v1', () => {
  it('adjusts aim and carry across risk profiles', () => {
    const conservative = compute({ profile: 'conservative' });
    const aggressive = compute({ profile: 'aggressive' });

    expect(Math.abs(conservative.recommended.offset_m)).toBeGreaterThanOrEqual(
      Math.abs(aggressive.recommended.offset_m) - 1e-6,
    );
    expect(aggressive.recommended.carry_m).toBeGreaterThanOrEqual(
      conservative.recommended.carry_m - 1e-6,
    );
  });

  it('remains deterministic for identical inputs', () => {
    const first = compute();
    const second = compute();

    expect(second.recommended.offset_m).toBeCloseTo(first.recommended.offset_m, 6);
    expect(second.recommended.carry_m).toBeCloseTo(first.recommended.carry_m, 6);
    expect(second.evScore).toBeCloseTo(first.evScore, 6);
  });

  it('applies optional risk bias without changing neutral outcomes', () => {
    const baseline = chooseStrategy(baseInput);
    const neutral = chooseStrategy(baseInput, { riskProfile: 'neutral' });

    expect(neutral.recommended.offset_m).toBeCloseTo(baseline.recommended.offset_m, 6);
    expect(neutral.recommended.carry_m).toBeCloseTo(baseline.recommended.carry_m, 6);
    expect(neutral.evScore).toBeCloseTo(baseline.evScore, 6);

    const aggressive = chooseStrategy(baseInput, { riskProfile: 'aggressive' });
    const conservative = chooseStrategy(baseInput, { riskProfile: 'conservative' });

    expect(Math.abs(aggressive.recommended.offset_m)).toBeLessThanOrEqual(
      Math.abs(baseline.recommended.offset_m) + 1e-6,
    );
    expect(Math.abs(conservative.recommended.offset_m)).toBeGreaterThanOrEqual(
      Math.abs(baseline.recommended.offset_m) - 1e-6,
    );
    expect(Math.abs(conservative.recommended.offset_m)).toBeGreaterThanOrEqual(
      Math.abs(aggressive.recommended.offset_m) - 1e-6,
    );
    expect(aggressive.recommended.carry_m).toBeGreaterThanOrEqual(
      baseline.recommended.carry_m - 1e-6,
    );
  });

  it('respects explicit carry and offset bounds', () => {
    const bounded = compute({ bounds: { minCarry_m: 140, maxCarry_m: 152, maxOffset_m: 5 } });

    expect(bounded.recommended.carry_m).toBeGreaterThanOrEqual(140 - 1e-6);
    expect(bounded.recommended.carry_m).toBeLessThanOrEqual(152 + 1e-6);
    expect(Math.abs(bounded.recommended.offset_m)).toBeLessThanOrEqual(5 + 1e-6);
  });

  it('aims further away as water or OB probability increases', () => {
    const mildHazard = compute({ hazard: { ...baseInput.hazard, water: 0.1, ob: 0.02 } });
    const severeHazard = compute({ hazard: { ...baseInput.hazard, water: 0.35, ob: 0.08 } });

    expect(Math.abs(severeHazard.recommended.offset_m)).toBeGreaterThanOrEqual(
      Math.abs(mildHazard.recommended.offset_m) - 1e-6,
    );
  });

  it('penalizes targets inside the fat-side buffer', () => {
    const lane: StrategyInput = {
      ...baseInput,
      hazard: { water: 0.4, bunker: 0, rough: 0.05, ob: 0.1, fairway: 0.35 },
    };
    const penaltyLane = scoreEV(lane, { offset_m: 1, carry_m: 150 }, STRATEGY_DEFAULTS.neutral);
    const safeLane = scoreEV(lane, { offset_m: 6, carry_m: 150 }, STRATEGY_DEFAULTS.neutral);

    expect(safeLane.ev).toBeGreaterThan(penaltyLane.ev);
  });

  it('tracks plays-like factor adjustments', () => {
    const baseline = compute({ playsLikeFactor: 1 });
    const elevated = compute({ playsLikeFactor: 1.08 });

    expect(elevated.recommended.carry_m).toBeGreaterThan(baseline.recommended.carry_m);
  });

  it('handles NaN or missing hazard inputs safely', () => {
    const decision = chooseStrategy({
      rawDist_m: Number.NaN,
      playsLikeFactor: Number.NaN,
      hazard: {
        water: Number.NaN,
        bunker: Number.NaN,
        rough: Number.NaN,
        ob: Number.NaN,
        fairway: Number.NaN,
      },
      dispersion: { sigma_m: Number.NaN, lateralSigma_m: Number.NaN },
      laneWidth_m: Number.NaN,
      profile: 'neutral',
    });

    expect(Number.isFinite(decision.recommended.carry_m)).toBe(true);
    expect(Number.isFinite(decision.recommended.offset_m)).toBe(true);
    expect(Number.isFinite(decision.evScore)).toBe(true);
  });
});

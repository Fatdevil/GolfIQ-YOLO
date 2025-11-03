import { describe, expect, it } from 'vitest';
import { computeSuggestions } from '../../../shared/caddie/suggest_v1';
import type { BagStats, HazardContext, PlaysLike, ScoreContext } from '../../../shared/caddie/types';

const buildBag = (stats: Partial<BagStats>): BagStats => ({
  D: undefined,
  '3W': undefined,
  '5W': undefined,
  '3i': undefined,
  '4i': undefined,
  '5i': undefined,
  '6i': undefined,
  '7i': undefined,
  '8i': undefined,
  '9i': undefined,
  PW: undefined,
  GW: undefined,
  SW: undefined,
  LW: undefined,
  ...stats,
});

const neutralScore: ScoreContext = { par: 4 };

const calmPlaysLike: PlaysLike = { raw_m: 150, fairwayFirmness: 'med' };

const calmHazards: HazardContext = {};

describe('computeSuggestions', () => {
  it('returns empty when insufficient clubs meet sample requirements', () => {
    const bag = buildBag({
      '7i': { p50_m: 140, p75_m: 148, p90_m: 154, samples: 8 },
      '8i': { p50_m: 128, p75_m: 134, p90_m: 140, samples: 3 },
    });

    const suggestions = computeSuggestions(bag, calmPlaysLike, calmHazards, neutralScore, {
      minSamples: 6,
    });

    expect(suggestions).toEqual([]);
  });

  it('orders 150m candidates by expected SG delta', () => {
    const bag = buildBag({
      '6i': { p50_m: 158, p75_m: 164, p90_m: 170, samples: 12 },
      '7i': { p50_m: 146, p75_m: 152, p90_m: 158, samples: 15 },
      '8i': { p50_m: 135, p75_m: 141, p90_m: 147, samples: 18 },
    });

    const suggestions = computeSuggestions(bag, calmPlaysLike, calmHazards, neutralScore);

    expect(suggestions).toHaveLength(3);
    const labels = suggestions.map((entry) => entry.label).sort();
    expect(labels).toEqual(['AGG', 'NEUTRAL', 'SAFE']);

    const deltas = suggestions.map((entry) => entry.expectedSGDelta);
    const sorted = [...deltas].sort((a, b) => b - a);
    expect(deltas).toEqual(sorted);
  });

  it('loosens risk thresholds when trailing badly late in the round', () => {
    const bag = buildBag({
      D: { p50_m: 230, p75_m: 242, p90_m: 255, samples: 20 },
      '3W': { p50_m: 215, p75_m: 225, p90_m: 235, samples: 20 },
      '5W': { p50_m: 205, p75_m: 215, p90_m: 225, samples: 20 },
    });

    const hazards: HazardContext = { leftPenaltyProb: 0.18, rightPenaltyProb: 0.12 };
    const playsLike: PlaysLike = { raw_m: 235, fairwayFirmness: 'firm' };

    const conservative = computeSuggestions(bag, playsLike, hazards, {
      par: 5,
      strokesToTarget: -2,
      holesRemaining: 4,
    });

    const chasing = computeSuggestions(bag, playsLike, hazards, {
      par: 5,
      strokesToTarget: 2,
      holesRemaining: 4,
    });

    expect(conservative.find((entry) => entry.label === 'AGG')).toBeUndefined();
    expect(chasing.find((entry) => entry.label === 'AGG')).toBeDefined();
  });

  it('filters clubs that cannot clear a front hazard requirement', () => {
    const bag = buildBag({
      '9i': { p50_m: 125, p75_m: 131, p90_m: 137, samples: 16 },
      '7i': { p50_m: 146, p75_m: 152, p90_m: 158, samples: 16 },
      '6i': { p50_m: 158, p75_m: 164, p90_m: 170, samples: 16 },
    });

    const hazards: HazardContext = { frontCarryReq_m: 160 };

    const suggestions = computeSuggestions(bag, calmPlaysLike, hazards, neutralScore);

    const carries = suggestions.map((entry) => entry.carry_m);

    expect(carries.every((carry) => carry >= 160 - 1e-6)).toBe(true);
  });

  it('treats missing plays-like modifiers the same as explicit neutral values', () => {
    const bag = buildBag({
      '6i': { p50_m: 158, p75_m: 164, p90_m: 170, samples: 14 },
      '7i': { p50_m: 146, p75_m: 152, p90_m: 158, samples: 18 },
      '8i': { p50_m: 135, p75_m: 141, p90_m: 147, samples: 18 },
    });

    const rawOnly: PlaysLike = { raw_m: 150 };
    const explicitZero: PlaysLike = { raw_m: 150, wind_mps: 0, temp_c: 0, elevation_m: 0 };

    const undefinedSuggestions = computeSuggestions(bag, rawOnly, {}, neutralScore);
    const zeroSuggestions = computeSuggestions(bag, explicitZero, {}, neutralScore);

    expect(undefinedSuggestions.length).toBeGreaterThan(0);
    undefinedSuggestions.forEach((entry) => {
      expect(Number.isFinite(entry.carry_m)).toBe(true);
      expect(Number.isFinite(entry.rollout_m)).toBe(true);
      expect(Number.isFinite(entry.expectedSGDelta)).toBe(true);
      expect(Number.isFinite(entry.riskPenaltyProb)).toBe(true);
      expect(entry.riskPenaltyProb).toBeGreaterThanOrEqual(0);
      expect(entry.riskPenaltyProb).toBeLessThanOrEqual(1);
      expect(Number.isFinite(entry.aim.lateral_m)).toBe(true);
      expect(Number.isFinite(entry.aim.expectedFairwayProb)).toBe(true);
    });

    expect(undefinedSuggestions).toEqual(zeroSuggestions);
  });

  it('defaults hazard probabilities when omitted', () => {
    const bag = buildBag({
      D: { p50_m: 230, p75_m: 242, p90_m: 255, samples: 25 },
      '3W': { p50_m: 215, p75_m: 225, p90_m: 235, samples: 24 },
      '5W': { p50_m: 205, p75_m: 215, p90_m: 225, samples: 22 },
    });

    const suggestions = computeSuggestions(bag, { raw_m: 225 }, {}, neutralScore);

    expect(suggestions.length).toBeGreaterThan(0);
    suggestions.forEach((entry) => {
      expect(entry.riskPenaltyProb).toBeGreaterThanOrEqual(0);
      expect(entry.riskPenaltyProb).toBeLessThanOrEqual(1);
      expect(Number.isFinite(entry.expectedSGDelta)).toBe(true);
      expect(Number.isFinite(entry.rollout_m)).toBe(true);
    });
  });
});


import { describe, expect, it } from "vitest";

import {
  MAX_DISTANCE_MULTIPLIER,
  MAX_FAT_SIDE_DELTA,
  MAX_HAZARD_MULTIPLIER,
  MIN_DISTANCE_MULTIPLIER,
  MIN_FAT_SIDE_DELTA,
  MIN_HAZARD_MULTIPLIER,
  STRATEGY_DEFAULTS,
  applyRiskBiasToWeights,
  getEffectiveWeights,
  resolveRiskBiasMultipliers,
  type RiskBiasOverride,
} from "./strategy_profiles";

describe("shared/caddie/strategy_profiles", () => {
  it("returns baseline weights when no override provided", () => {
    const base = STRATEGY_DEFAULTS.neutral;
    const effective = getEffectiveWeights("neutral");
    expect(effective.hazardWater).toBeCloseTo(base.hazardWater, 6);
    expect(effective.distanceReward).toBeCloseTo(base.distanceReward, 6);
    expect(effective.fatSideBias_m).toBeCloseTo(base.fatSideBias_m, 6);
  });

  it("applies overrides with clamping", () => {
    const override: RiskBiasOverride = {
      hazardDelta: 5,
      distanceRewardDelta: -5,
      fatSideBiasDelta: 10,
    };
    const multipliers = resolveRiskBiasMultipliers("conservative", override);
    expect(multipliers.hazard).toBeLessThanOrEqual(MAX_HAZARD_MULTIPLIER + 1e-6);
    expect(multipliers.hazard).toBeGreaterThanOrEqual(MIN_HAZARD_MULTIPLIER - 1e-6);
    expect(multipliers.distanceReward).toBeGreaterThanOrEqual(MIN_DISTANCE_MULTIPLIER - 1e-6);
    expect(multipliers.distanceReward).toBeLessThanOrEqual(MAX_DISTANCE_MULTIPLIER + 1e-6);
    expect(multipliers.fatSideBiasDelta).toBeLessThanOrEqual(MAX_FAT_SIDE_DELTA + 1e-6);
    expect(multipliers.fatSideBiasDelta).toBeGreaterThanOrEqual(MIN_FAT_SIDE_DELTA - 1e-6);
  });

  it("applies overrides when scoring different risk profiles", () => {
    const baseWeights = STRATEGY_DEFAULTS.neutral;
    const aggressiveOverride: RiskBiasOverride = { hazardDelta: -0.1, distanceRewardDelta: 0.1 };
    const conservativeOverride: RiskBiasOverride = { hazardDelta: 0.1, distanceRewardDelta: -0.1 };

    const aggressiveWeights = applyRiskBiasToWeights(baseWeights, "aggressive", aggressiveOverride);
    const conservativeWeights = applyRiskBiasToWeights(baseWeights, "conservative", conservativeOverride);

    expect(aggressiveWeights.hazardWater).toBeLessThan(conservativeWeights.hazardWater);
    expect(aggressiveWeights.distanceReward).toBeGreaterThan(conservativeWeights.distanceReward);
  });
});

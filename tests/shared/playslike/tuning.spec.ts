import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_COEFFS,
  clearTunedCoeffs,
  getTunedCoeffs,
  learnPersonalCoefficients,
  type PersonalCoefficients,
  type ShotObservation,
  type TuningSnapshot,
  __resetTuningCacheForTests,
  __setTuningStorageForTests,
} from "../../../shared/playslike/tuning";

type MemoryStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function createMemoryStorage(): MemoryStorage {
  const store = new Map<string, string>();
  return {
    async getItem(key: string): Promise<string | null> {
      return store.has(key) ? store.get(key)! : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

const REF_TEMP_C = 20;

function buildSyntheticShots(
  targetCoeffs: PersonalCoefficients,
  count: number,
): ShotObservation[] {
  const shots: ShotObservation[] = [];
  for (let idx = 0; idx < count; idx += 1) {
    const baseDistance = 130 + (idx % 5) * 7 + idx * 0.4;
    const temperatureC = 6 + (idx % 6) * 3; // never hits reference 20 C
    const altitudeM = 120 + (idx % 4) * 85;
    const windSpeed = 2 + (idx % 5);
    const windFrom = (idx * 27) % 360;
    const targetAzimuth = (idx * 19) % 360;
    const slopeDh = -3 + ((idx % 7) - 3);

    const diffC = REF_TEMP_C - temperatureC;
    const tempFeature = baseDistance * diffC;
    const altFeature = baseDistance * (altitudeM / 100);
    const thetaRad = ((windFrom - targetAzimuth) * Math.PI) / 180;
    const headComponent = windSpeed * Math.cos(thetaRad);
    const headFeature = -baseDistance * headComponent;
    const slopeFeature = -slopeDh;

    const basePlaysLike =
      baseDistance +
      DEFAULT_COEFFS.betaPerC * tempFeature +
      DEFAULT_COEFFS.gammaPer100m * altFeature +
      DEFAULT_COEFFS.head_per_mps * headFeature +
      DEFAULT_COEFFS.slope_per_m * slopeFeature;

    const actualCarry =
      baseDistance +
      targetCoeffs.betaPerC * tempFeature +
      targetCoeffs.gammaPer100m * altFeature +
      targetCoeffs.head_per_mps * headFeature +
      targetCoeffs.slope_per_m * slopeFeature;

    shots.push({
      baseDistance_m: baseDistance,
      actual_carry_m: actualCarry,
      playsLike_base_m: basePlaysLike,
      temperatureC,
      altitude_m: altitudeM,
      wind_mps: windSpeed,
      wind_from_deg: windFrom,
      target_azimuth_deg: targetAzimuth,
      slope_dh_m: slopeDh,
    });
  }
  return shots;
}

describe("plays-like personal tuning", () => {
  const targetCoeffs: PersonalCoefficients = {
    betaPerC: 0.0026,
    gammaPer100m: 0.0082,
    head_per_mps: 0.0175,
    slope_per_m: 1.05,
  };

  beforeEach(async () => {
    __setTuningStorageForTests(createMemoryStorage());
    __resetTuningCacheForTests();
    await clearTunedCoeffs();
  });

  it("recovers underlying coefficients as data accumulates", async () => {
    const dataset = buildSyntheticShots(targetCoeffs, 200);
    const snapshot = await learnPersonalCoefficients(dataset);

    expect(snapshot).not.toBeNull();
    const resolved = snapshot as TuningSnapshot;
    expect(resolved.samples).toBe(200);
    expect(resolved.alpha).toBe(1);

    const tuned = getTunedCoeffs();
    expect(tuned).not.toBeNull();
    expect(tuned!.betaPerC).toBeCloseTo(targetCoeffs.betaPerC, 4);
    expect(tuned!.gammaPer100m).toBeCloseTo(targetCoeffs.gammaPer100m, 4);
    expect(tuned!.head_per_mps).toBeCloseTo(targetCoeffs.head_per_mps, 4);
    expect(tuned!.slope_per_m).toBeCloseTo(targetCoeffs.slope_per_m, 4);
  });

  it("shrinks toward defaults when limited samples", async () => {
    const dataset = buildSyntheticShots(targetCoeffs, 10);
    const snapshot = await learnPersonalCoefficients(dataset);

    expect(snapshot).not.toBeNull();
    const resolved = snapshot as TuningSnapshot;
    expect(resolved.samples).toBe(10);
    expect(resolved.alpha).toBeCloseTo(0.1, 6);

    const tuned = getTunedCoeffs();
    expect(tuned).not.toBeNull();

    const expectedBlend = (weight: number, base: number, target: number) =>
      (1 - weight) * base + weight * target;

    expect(tuned!.betaPerC).toBeCloseTo(expectedBlend(0.1, DEFAULT_COEFFS.betaPerC, targetCoeffs.betaPerC), 4);
    expect(tuned!.gammaPer100m).toBeCloseTo(
      expectedBlend(0.1, DEFAULT_COEFFS.gammaPer100m, targetCoeffs.gammaPer100m),
      4,
    );
    expect(tuned!.head_per_mps).toBeCloseTo(
      expectedBlend(0.1, DEFAULT_COEFFS.head_per_mps, targetCoeffs.head_per_mps),
      4,
    );
    expect(tuned!.slope_per_m).toBeCloseTo(
      expectedBlend(0.1, DEFAULT_COEFFS.slope_per_m, targetCoeffs.slope_per_m),
      4,
    );
  });
});

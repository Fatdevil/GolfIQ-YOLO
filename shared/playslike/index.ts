import type { PlaysLikeComponents, PlaysLikeResult } from "./PlaysLikeService";
import {
  computeTempAltDelta,
  type TempAltDelta,
  type TempAltInput,
} from "./adjust_temp_alt";

const roundTo = (value: number, decimals = 1): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** Math.max(0, decimals);
  return Math.round(value * factor) / factor;
};

const sanitizeDistance = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

export type TempAltOverrides = {
  enable?: boolean;
  temperature?: TempAltInput["temperature"];
  altitudeASL?: TempAltInput["altitudeASL"];
  betaPerC?: number;
  gammaPer100m?: number;
  caps?: TempAltInput["caps"];
};

export interface ApplyPlaysLikeAdjustmentsInput {
  baseDistance_m: number;
  baseResult: PlaysLikeResult;
  tempAlt?: TempAltOverrides | null;
}

export interface PlaysLikeComponentsWithTempAlt extends PlaysLikeComponents {
  tempM: number;
  altM: number;
  tempAltTotalM: number;
}

export interface PlaysLikeAugmentedResult extends PlaysLikeResult {
  components: PlaysLikeComponentsWithTempAlt;
  tempAltDelta: TempAltDelta;
  totalDelta_m: number;
}

export const applyPlaysLikeAdjustments = (
  input: ApplyPlaysLikeAdjustmentsInput,
): PlaysLikeAugmentedResult => {
  const baseDistance = sanitizeDistance(input.baseDistance_m);
  const tempAltInput = input.tempAlt;
  const enableTempAlt = Boolean(tempAltInput?.enable);

  const tempAltDelta = tempAltInput
    ? computeTempAltDelta({
        baseDistance_m: baseDistance,
        enable: enableTempAlt,
        temperature: tempAltInput.temperature ?? null,
        altitudeASL: tempAltInput.altitudeASL ?? null,
        betaPerC: tempAltInput.betaPerC,
        gammaPer100m: tempAltInput.gammaPer100m,
        caps: tempAltInput.caps,
      })
    : { deltaTemp_m: 0, deltaAlt_m: 0, deltaTotal_m: 0 };

  const slope = input.baseResult.components.slopeM;
  const wind = input.baseResult.components.windM;
  const combinedDelta = slope + wind + tempAltDelta.deltaTotal_m;

  const augmented: PlaysLikeAugmentedResult = {
    ...input.baseResult,
    distanceEff: roundTo(input.baseResult.distanceEff + tempAltDelta.deltaTotal_m, 1),
    components: {
      ...input.baseResult.components,
      tempM: roundTo(tempAltDelta.deltaTemp_m, 1),
      altM: roundTo(tempAltDelta.deltaAlt_m, 1),
      tempAltTotalM: roundTo(tempAltDelta.deltaTotal_m, 1),
    },
    tempAltDelta,
    totalDelta_m: roundTo(combinedDelta, 1),
  };

  return augmented;
};

export type { TempAltDelta } from "./adjust_temp_alt";
export { computeTempAltDelta, type TempAltInput } from "./adjust_temp_alt";
export { toMeters, toCelsius, toFeet, toYards } from "./units";
export type { TempAltOverrides };

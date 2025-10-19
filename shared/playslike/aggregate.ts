import { computeTempAltDelta } from "./adjust_temp_alt";
import { defaultBag, suggestClub } from "./bag";
import { computeWindSlopeDelta } from "./wind_slope";

export interface PlanInput {
  baseDistance_m: number;
  temperatureC?: number;
  altitude_m?: number;
  wind_mps?: number;
  wind_from_deg?: number;
  target_azimuth_deg?: number;
  slope_dh_m?: number;
}

export interface PlanOut {
  playsLike_m: number;
  breakdown: {
    temp_m: number;
    alt_m: number;
    head_m: number;
    slope_m: number;
  };
  clubSuggested?: string;
}

const sanitizeNumber = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Number(value);
};

const sanitizeDistance = (value: number | undefined): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const numeric = Number(value);
  return numeric > 0 ? numeric : 0;
};

export function computePlaysLike(input: PlanInput): PlanOut {
  const baseDistance = sanitizeDistance(input.baseDistance_m);
  const temperatureC = sanitizeNumber(input.temperatureC, 20);
  const altitudeM = sanitizeNumber(input.altitude_m, 0);
  const windSpeed = sanitizeNumber(input.wind_mps, 0);
  const windFrom = sanitizeNumber(input.wind_from_deg, 0);
  const targetAzimuth = sanitizeNumber(input.target_azimuth_deg, 0);
  const slopeDh = sanitizeNumber(input.slope_dh_m, 0);

  const tempAltDelta = computeTempAltDelta({
    baseDistance_m: baseDistance,
    enable: true,
    temperature: { value: temperatureC, unit: "C" },
    altitudeASL: { value: altitudeM, unit: "m" },
  });

  const windSlopeDelta = computeWindSlopeDelta({
    baseDistance_m: baseDistance,
    enable: true,
    wind: { speed_mps: windSpeed, direction_deg_from: windFrom, targetAzimuth_deg: targetAzimuth },
    slope: { deltaHeight_m: slopeDh },
  });

  const breakdown = {
    temp_m: tempAltDelta.deltaTemp_m,
    alt_m: tempAltDelta.deltaAlt_m,
    head_m: windSlopeDelta.deltaHead_m,
    slope_m: windSlopeDelta.deltaSlope_m,
  } as const;

  const playsLike =
    baseDistance +
    tempAltDelta.deltaTemp_m +
    tempAltDelta.deltaAlt_m +
    windSlopeDelta.deltaHead_m +
    windSlopeDelta.deltaSlope_m;

  let clubSuggested: string | undefined;
  if (baseDistance > 0) {
    const bag = defaultBag();
    clubSuggested = suggestClub(bag, playsLike);
  }

  return {
    playsLike_m: playsLike,
    breakdown,
    clubSuggested,
  };
}

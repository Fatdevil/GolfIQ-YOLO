import { windAlongHeading } from "./geometry";

export type PlaysLikeInput = {
  rawDist_m: number;
  elevDiff_m: number;
  temp_C: number;
  heading_deg: number;
  wind_mps?: { x: number; y: number };
  coeffs?: {
    elev_per_m?: number;
    temp_per_C?: number;
    wind_head_per_mps?: number;
    wind_tail_per_mps?: number;
  };
  clamp?: { minFactor?: number; maxFactor?: number };
};

export type PlaysLikeResult = {
  factor: number;
  distance_m: number;
  breakdown: { elev: number; temp: number; wind: number };
  meta: { headwind_mps: number; along_mps: number };
};

export const DEFAULT_PLAYS_LIKE_COEFFS = Object.freeze({
  elev_per_m: 0.007,
  temp_per_C: -0.002,
  wind_head_per_mps: 0.02,
  wind_tail_per_mps: -0.015,
});

export const DEFAULT_PLAYS_LIKE_CLAMP = Object.freeze({ minFactor: 0.85, maxFactor: 1.2 });

const clampValue = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const sanitizeNumber = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Number(value);
};

export function playsLikeDistance(input: PlaysLikeInput): PlaysLikeResult {
  const coeffs = input.coeffs ?? {};
  const clampBounds = input.clamp ?? {};

  const rawDistance = sanitizeNumber(input.rawDist_m, 0);
  const minFactor = sanitizeNumber(clampBounds.minFactor, DEFAULT_PLAYS_LIKE_CLAMP.minFactor);
  const maxFactor = sanitizeNumber(clampBounds.maxFactor, DEFAULT_PLAYS_LIKE_CLAMP.maxFactor);
  const elevCoeff = sanitizeNumber(coeffs.elev_per_m, DEFAULT_PLAYS_LIKE_COEFFS.elev_per_m);
  const tempCoeff = sanitizeNumber(coeffs.temp_per_C, DEFAULT_PLAYS_LIKE_COEFFS.temp_per_C);
  const windHeadCoeff = sanitizeNumber(
    coeffs.wind_head_per_mps,
    DEFAULT_PLAYS_LIKE_COEFFS.wind_head_per_mps,
  );
  const windTailCoeff = sanitizeNumber(
    coeffs.wind_tail_per_mps,
    DEFAULT_PLAYS_LIKE_COEFFS.wind_tail_per_mps,
  );

  const heading = sanitizeNumber(input.heading_deg, 0);
  const wind = input.wind_mps && Number.isFinite(input.wind_mps.x) && Number.isFinite(input.wind_mps.y)
    ? { x: Number(input.wind_mps.x), y: Number(input.wind_mps.y) }
    : undefined;

  const elevDiffRaw = sanitizeNumber(input.elevDiff_m, 0);
  const elevDiff = clampValue(elevDiffRaw, -20, 20);
  const elevContribution = elevDiff * elevCoeff;

  const tempC = sanitizeNumber(input.temp_C, 15);
  const tempContribution = (tempC - 15) * tempCoeff;

  const alongWind = windAlongHeading(wind, heading);
  const windContribution = alongWind >= 0
    ? alongWind * windHeadCoeff
    : Math.abs(alongWind) * windTailCoeff;

  const unclampedFactor = 1 + elevContribution + tempContribution + windContribution;
  const clampMin = Math.min(minFactor, maxFactor);
  const clampMax = Math.max(minFactor, maxFactor);
  const factor = clampValue(unclampedFactor, clampMin, clampMax);
  const distance = rawDistance * factor;

  return {
    factor,
    distance_m: Number.isFinite(distance) ? distance : 0,
    breakdown: {
      elev: Number.isFinite(elevContribution) ? elevContribution : 0,
      temp: Number.isFinite(tempContribution) ? tempContribution : 0,
      wind: Number.isFinite(windContribution) ? windContribution : 0,
    },
    meta: {
      headwind_mps: alongWind > 0 ? alongWind : 0,
      along_mps: Number.isFinite(alongWind) ? alongWind : 0,
    },
  };
}

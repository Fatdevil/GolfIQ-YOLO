export type DistanceUnit = "m" | "yd" | "ft";
export type TemperatureUnit = "C" | "F";

const METERS_PER_YARD = 0.9144;
const METERS_PER_FOOT = 0.3048;

export const toMeters = (value: number, unit: DistanceUnit): number => {
  if (!Number.isFinite(value)) {
    return NaN;
  }
  switch (unit) {
    case "m":
      return value;
    case "yd":
      return value * METERS_PER_YARD;
    case "ft":
      return value * METERS_PER_FOOT;
    default:
      return NaN;
  }
};

export const toFeet = (meters: number): number => {
  if (!Number.isFinite(meters)) {
    return NaN;
  }
  return meters / METERS_PER_FOOT;
};

export const toYards = (meters: number): number => {
  if (!Number.isFinite(meters)) {
    return NaN;
  }
  return meters / METERS_PER_YARD;
};

export const toCelsius = (value: number, unit: TemperatureUnit): number => {
  if (!Number.isFinite(value)) {
    return NaN;
  }
  switch (unit) {
    case "C":
      return value;
    case "F":
      return ((value - 32) * 5) / 9;
    default:
      return NaN;
  }
};

import { toCelsius, toMeters, type DistanceUnit, type TemperatureUnit } from "./units";

const DEFAULT_REF_TEMP_C = 20;
const DEFAULT_BETA_PER_C = 0.0018;
const DEFAULT_GAMMA_PER_100M = 0.0065;
const DEFAULT_COMPONENT_CAP_FRACTION = 0.1;
const DEFAULT_TOTAL_CAP_FRACTION = 0.2;

export interface TempAltInput {
  baseDistance_m: number;
  temperature: { value: number; unit: TemperatureUnit } | null;
  altitudeASL: { value: number; unit: Extract<DistanceUnit, "m" | "ft"> } | null;
  enable: boolean;
  betaPerC?: number;
  gammaPer100m?: number;
  caps?: { perComponent?: number; total?: number };
}

export interface TempAltDelta {
  deltaTemp_m: number;
  deltaAlt_m: number;
  deltaTotal_m: number;
  notes?: string[];
}

const sanitizeDistance = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

const clampAbs = (value: number, limit: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const max = Math.max(0, limit);
  if (max === 0) {
    return 0;
  }
  const magnitude = Math.abs(value);
  if (magnitude <= max) {
    return value;
  }
  return Math.sign(value) * max;
};

const sanitizeFraction = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (value <= 0) {
    return 0;
  }
  return value;
};

const sanitizeCoefficient = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return value;
};

const safeNumber = (value: number): number => (Object.is(value, -0) ? 0 : value);

export const computeTempAltDelta = (input: TempAltInput): TempAltDelta => {
  const baseDistance = sanitizeDistance(input.baseDistance_m);
  const enabled = Boolean(input.enable) && baseDistance > 0;

  const beta = sanitizeCoefficient(input.betaPerC, DEFAULT_BETA_PER_C);
  const gamma = sanitizeCoefficient(input.gammaPer100m, DEFAULT_GAMMA_PER_100M);
  const perComponentCapFraction = sanitizeFraction(
    input.caps?.perComponent,
    DEFAULT_COMPONENT_CAP_FRACTION,
  );
  const totalCapFraction = sanitizeFraction(input.caps?.total, DEFAULT_TOTAL_CAP_FRACTION);

  const perComponentCapValue = baseDistance * perComponentCapFraction;
  const totalCapValue = baseDistance * totalCapFraction;

  const notes: string[] = [];

  if (!enabled) {
    return { deltaTemp_m: 0, deltaAlt_m: 0, deltaTotal_m: 0 };
  }

  const temperature = input.temperature;
  let deltaTemp = 0;
  if (temperature && Number.isFinite(temperature.value)) {
    const tempC = toCelsius(temperature.value, temperature.unit);
    if (Number.isFinite(tempC)) {
      const diffC = DEFAULT_REF_TEMP_C - tempC;
      const raw = baseDistance * beta * diffC;
      const capped = clampAbs(raw, perComponentCapValue);
      if (capped !== raw) {
        notes.push("temp_component_capped");
      }
      deltaTemp = capped;
    }
  }

  const altitude = input.altitudeASL;
  let deltaAlt = 0;
  if (altitude && Number.isFinite(altitude.value)) {
    const altUnit: DistanceUnit = altitude.unit === "ft" ? "ft" : "m";
    const altM = toMeters(altitude.value, altUnit);
    if (Number.isFinite(altM)) {
      const raw = baseDistance * gamma * (altM / 100);
      const capped = clampAbs(raw, perComponentCapValue);
      if (capped !== raw) {
        notes.push("alt_component_capped");
      }
      deltaAlt = capped;
    }
  }

  let deltaTotal = deltaTemp + deltaAlt;

  if (totalCapValue === 0) {
    if (deltaTemp !== 0 || deltaAlt !== 0) {
      notes.push("total_capped");
    }
    deltaTemp = 0;
    deltaAlt = 0;
    deltaTotal = 0;
  } else if (Math.abs(deltaTotal) > totalCapValue && totalCapValue > 0) {
    const scale = totalCapValue / Math.abs(deltaTotal);
    deltaTemp *= scale;
    deltaAlt *= scale;
    deltaTotal = deltaTemp + deltaAlt;
    notes.push("total_capped");
  }

  const result: TempAltDelta = {
    deltaTemp_m: safeNumber(deltaTemp),
    deltaAlt_m: safeNumber(deltaAlt),
    deltaTotal_m: safeNumber(deltaTotal),
  };

  if (notes.length > 0) {
    result.notes = Array.from(new Set(notes));
  }

  return result;
};

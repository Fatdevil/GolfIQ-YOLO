export type TracerPoint = [number, number];

export type HomographyMatrix = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type TracerSource = 'raw' | 'ballistic' | 'fit' | 'computed';

export type TracerFit = {
  points: TracerPoint[];
  apexIndex: number;
  landingIndex: number;
  source: TracerSource;
  estimated: boolean;
  flags: string[];
};

export type TracerTooltip = {
  apex_m: number | null;
  carry_m: number | null;
  estimated: boolean;
};

export type TracerCalibration = {
  H: HomographyMatrix;
  yardage_m?: number | null;
  quality?: number | null;
  createdAt?: number | null;
};

function toFiniteOrNull(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function isValidHomography(H: unknown): H is HomographyMatrix {
  return Array.isArray(H) && H.length === 9 && H.every((value) => Number.isFinite(value));
}

export function cloneTracerCalibration(
  calib: TracerCalibration | null | undefined,
): TracerCalibration | null {
  if (!calib || !isValidHomography(calib.H)) {
    return null;
  }
  const yardage = toFiniteOrNull(calib.yardage_m);
  const quality = toFiniteOrNull(calib.quality);
  const createdAt = toFiniteOrNull(calib.createdAt);
  return {
    H: [...calib.H] as HomographyMatrix,
    yardage_m: yardage,
    quality,
    createdAt,
  };
}

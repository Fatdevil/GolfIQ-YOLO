export type TracerPoint = [number, number];

export type HomographyMatrix = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
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
  teePx: { x: number; y: number };
  flagPx: { x: number; y: number };
  yardage_m: number;
  holeBearingDeg: number;
  quality: number;
  matrix: HomographyMatrix;
  updatedAt: number;
};

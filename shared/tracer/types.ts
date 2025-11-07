export type TracerPoint = [number, number];

export type TracerSource = 'raw' | 'ballistic' | 'fit';

export type TracerFit = {
  points: TracerPoint[];
  apexIndex: number;
  landingIndex: number;
  source: TracerSource;
  estimated: boolean;
  flags: string[];
};

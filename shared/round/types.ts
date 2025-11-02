export type UUID = string;

export type GeoPoint = {
  lat: number;
  lon: number;
  ts: number;
};

export type Lie = 'Tee' | 'Fairway' | 'Rough' | 'Sand' | 'Recovery' | 'Green' | 'Penalty';

export type ShotKind = 'Full' | 'Chip' | 'Pitch' | 'Putt' | 'Recovery' | 'Penalty';

export interface ShotEvent {
  id: UUID;
  hole: number;
  seq: number;
  club?: string;
  start: GeoPoint;
  end?: GeoPoint;
  startLie: Lie;
  endLie?: Lie;
  carry_m?: number;
  toPinStart_m?: number;
  toPinEnd_m?: number;
  sg?: number;
  playsLikePct?: number;
  kind: ShotKind;
}

export type HoleState = {
  hole: number;
  par: number;
  index?: number;
  pin?: { lat: number; lon: number };
  shots: ShotEvent[];
  sgTotal?: number;
  strokes?: number;
  putts?: number;
  penalties?: number;
  metrics?: {
    fir: boolean | null;
    gir: boolean | null;
    reachedGreenAt: number | null;
  };
  manualScore?: number;
  manualPutts?: number;
};

export type RoundState = {
  id: UUID;
  courseId: string;
  startedAt: number;
  finishedAt?: number;
  holes: Record<number, HoleState>;
  currentHole: number;
  tournamentSafe: boolean;
};

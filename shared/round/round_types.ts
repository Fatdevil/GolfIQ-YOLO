export interface Shot {
  tStart: number;
  tEnd?: number;
  club: string;
  base_m: number;
  playsLike_m: number;
  carry_m?: number;
  pin: { lat: number; lon: number };
  land?: { lat: number; lon: number };
  heading_deg?: number;
}

export interface Hole {
  holeNo: number;
  par: number;
  shots: Shot[];
  score?: number;
}

export interface Round {
  id: string;
  courseId: string;
  tee?: string;
  startedAt: number;
  holes: Hole[];
  currentHole: number;
  finished?: boolean;
}

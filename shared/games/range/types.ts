export type LocalPoint = { x: number; y: number };
export type RingTarget = {
  id: string;
  label: string;
  carry_m: number;
  radius_m: number;
  center: LocalPoint;
};
export type ShotIn = {
  ts: number;
  club?: string;
  carry_m?: number;
  landing?: LocalPoint;
  lateralSign?: number;
  startDeg?: number;
};
export type Hit = {
  targetId: string;
  shotTs: number;
  club?: string;
  distanceError_m: number;
  lateral_m: number;
  points: number;
};
export type GameMode = 'target_bingo';
export type GameState = {
  mode: GameMode;
  startedAt: number;
  endedAt?: number;
  targets: RingTarget[];
  shots: ShotIn[];
  hits: Hit[];
  score: number;
  streak: number;
  perClub: Record<string, { shots: number; hits: number; score: number }>;
};

export type HeatmapBin = { x: number; y: number; n: number };
export type Heatmap = { width: number; height: number; bins: HeatmapBin[] };

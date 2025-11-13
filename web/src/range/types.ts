export type RangeShotMetrics = {
  ballSpeedMps: number | null;
  ballSpeedMph: number | null;
  carryM: number | null;
  launchDeg: number | null;
  sideAngleDeg: number | null;
  quality: "good" | "medium" | "poor";
};

export type RangeShot = {
  id: string;
  ts: number;
  club: string;
  metrics: RangeShotMetrics;
};

export type RangeSessionSummary = {
  shots: number;
  avgBallSpeedMps: number | null;
  avgCarryM: number | null;
  dispersionSideDeg: number | null;
};

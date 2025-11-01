export type GeoPoint = {
  lat: number;
  lon: number;
  /** optional timestamp in milliseconds */
  ts?: number;
};

export type HoleRef = {
  id: string;
  number: number;
  front: GeoPoint;
  middle: GeoPoint;
  back: GeoPoint;
};

export type FollowPhase = 'locate' | 'follow' | 'advance';

export type FollowState = {
  phase: FollowPhase;
  hole: HoleRef | null;
  roundId: string | null;
  holeIndex: number;
  autoAdvanceEnabled: boolean;
  enterGreenAt: number | null;
  leaveCandidateAt: number | null;
  overrideTs: number | null;
  lastUpdateTs: number;
  lastHeadingDeg: number | null;
  lastSnapshotTs: number | null;
};

export type FollowSnapshot = {
  ts: number;
  holeNo: number;
  fmb: { front: number; middle: number; back: number };
  headingDeg: number;
  playsLikePct?: number;
  tournamentSafe: boolean;
};

export type RangeMode = 'quick';

export type RangeCameraAngle = 'down_the_line' | 'face_on';

export interface RangeShot {
  id: string;
  timestamp: string;
  club: string | null;
  targetDistanceM?: number | null;
  cameraAngle?: RangeCameraAngle;

  carryM?: number | null;
  sideDeg?: number | null;
  launchDeg?: number | null;
  ballSpeedMps?: number | null;
  clubSpeedMps?: number | null;
  qualityLevel?: 'bad' | 'warning' | 'good' | null;
}

export interface RangeSession {
  id: string;
  mode: RangeMode;
  startedAt: string;
  finishedAt?: string | null;
  club: string | null;
  targetDistanceM?: number | null;
  cameraAngle: RangeCameraAngle;
  shots: RangeShot[];
}

export interface RangeSessionSummary {
  id: string;
  startedAt: string;
  finishedAt: string;
  club: string | null;
  targetDistanceM?: number | null;
  trainingGoalText?: string;
  missionId?: string;
  missionTitleKey?: string;
  sessionRating?: number;
  reflectionNotes?: string;
  shotCount: number;
  contactPct?: number | null;
  avgCarryM?: number | null;
  tendency?: 'left' | 'right' | 'straight' | null;
}

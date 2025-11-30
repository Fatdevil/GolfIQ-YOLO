export type RangeMode = 'quick';

export type RangeCameraAngle = 'down_the_line' | 'face_on';

export type RangeShotAnalysis = {
  summary?: string;
  cues?: string[];
};

export interface RangeShot {
  id: string;
  createdAt: string;
  club: string | null;
  cameraAngle: RangeCameraAngle;
  targetDistanceM?: number | null;
  analysis?: RangeShotAnalysis | null;
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

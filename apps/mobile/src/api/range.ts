import { apiFetch } from '@app/api/client';
import type { RangeCameraAngle } from '@app/range/rangeSession';

export interface RangeAnalyzeRequest {
  club?: string | null;
  targetDistanceM?: number | null;
  cameraAngle?: RangeCameraAngle;
  framesToken?: string | null;
}

export interface RangeAnalyzeOut {
  id?: string;
  ballSpeedMps?: number | null;
  clubSpeedMps?: number | null;
  carryM?: number | null;
  launchDeg?: number | null;
  sideDeg?: number | null;
  quality?: {
    score: number;
    level: 'bad' | 'warning' | 'good';
    reasons: string[];
  } | null;
  summary?: string | null;
  cues?: string[];
}

export async function analyzeRangeShot(request: RangeAnalyzeRequest): Promise<RangeAnalyzeOut> {
  return apiFetch<RangeAnalyzeOut>('/api/range/practice/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

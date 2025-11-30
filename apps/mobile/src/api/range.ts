import { apiFetch } from '@app/api/client';
import type { RangeCameraAngle } from '@app/range/rangeSession';

export interface RangeAnalyzeRequest {
  club?: string | null;
  targetDistanceM?: number | null;
  cameraAngle?: RangeCameraAngle;
  framesToken?: string | null;
}

export interface RangeAnalyzeResponse {
  id: string;
  summary?: string;
  cues?: string[];
}

export async function analyzeRangeShot(request: RangeAnalyzeRequest): Promise<RangeAnalyzeResponse> {
  return apiFetch<RangeAnalyzeResponse>('/api/range/practice/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

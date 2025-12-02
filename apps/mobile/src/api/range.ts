import { apiFetch } from '@app/api/client';
import type { RangeCameraAngle } from '@app/range/rangeSession';

export interface RangeAnalyzeRequest {
  club?: string | null;
  targetDistanceM?: number | null;
  cameraAngle?: RangeCameraAngle;
  framesToken?: string | null;
}

interface RangeAnalyzeOutRaw {
  id?: string;
  ball_speed_mps?: number | null;
  club_speed_mps?: number | null;
  carry_m?: number | null;
  launch_deg?: number | null;
  side_deg?: number | null;
  quality?: {
    score: number;
    level: 'bad' | 'warning' | 'good';
    reasons: string[];
  } | null;
  summary?: string | null;
  cues?: string[];
  tempo_backswing_ms?: number | null;
  tempo_downswing_ms?: number | null;
  tempo_ratio?: number | null;
  tempoBackswingMs?: number | null;
  tempoDownswingMs?: number | null;
  tempoRatio?: number | null;
  // Allow already-normalized keys to avoid breaking mocks
  ballSpeedMps?: number | null;
  clubSpeedMps?: number | null;
  carryM?: number | null;
  launchDeg?: number | null;
  sideDeg?: number | null;
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
  tempoBackswingMs?: number | null;
  tempoDownswingMs?: number | null;
  tempoRatio?: number | null;
}

export function normalizeRangeAnalyzeResponse(raw: RangeAnalyzeOutRaw): RangeAnalyzeOut {
  return {
    id: raw.id,
    ballSpeedMps: raw.ball_speed_mps ?? raw.ballSpeedMps ?? null,
    clubSpeedMps: raw.club_speed_mps ?? raw.clubSpeedMps ?? null,
    carryM: raw.carry_m ?? raw.carryM ?? null,
    launchDeg: raw.launch_deg ?? raw.launchDeg ?? null,
    sideDeg: raw.side_deg ?? raw.sideDeg ?? null,
    quality: raw.quality ?? null,
    summary: raw.summary ?? null,
    cues: raw.cues,
    tempoBackswingMs: raw.tempo_backswing_ms ?? raw.tempoBackswingMs ?? null,
    tempoDownswingMs: raw.tempo_downswing_ms ?? raw.tempoDownswingMs ?? null,
    tempoRatio: raw.tempo_ratio ?? raw.tempoRatio ?? null,
  };
}

export async function analyzeRangeShot(request: RangeAnalyzeRequest): Promise<RangeAnalyzeOut> {
  const raw = await apiFetch<RangeAnalyzeOutRaw>('/api/range/practice/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  return normalizeRangeAnalyzeResponse(raw);
}

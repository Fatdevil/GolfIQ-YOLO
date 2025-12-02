import { apiFetch } from './client';

export interface Round {
  id: string;
  courseId?: string | null;
  teeName?: string | null;
  holes: number;
  startedAt: string;
  endedAt?: string | null;
}

export interface Shot {
  id: string;
  roundId: string;
  playerId?: string;
  holeNumber: number;
  club: string;
  createdAt: string;
  startLat: number;
  startLon: number;
  endLat?: number | null;
  endLon?: number | null;
  windSpeedMps?: number | null;
  windDirectionDeg?: number | null;
  elevationDeltaM?: number | null;
  note?: string | null;
}

export async function startRound(req: {
  courseId?: string;
  teeName?: string;
  holes?: number;
}): Promise<Round> {
  return apiFetch<Round>('/api/rounds/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function endRound(roundId: string): Promise<Round> {
  return apiFetch<Round>(`/api/rounds/${roundId}/end`, { method: 'POST' });
}

export async function appendShot(
  roundId: string,
  req: {
    holeNumber: number;
    club: string;
    startLat: number;
    startLon: number;
    endLat?: number;
    endLon?: number;
    windSpeedMps?: number;
    windDirectionDeg?: number;
    elevationDeltaM?: number;
    note?: string;
  },
): Promise<Shot> {
  return apiFetch<Shot>(`/api/rounds/${roundId}/shots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function listRoundShots(roundId: string): Promise<Shot[]> {
  return apiFetch<Shot[]>(`/api/rounds/${roundId}/shots`);
}

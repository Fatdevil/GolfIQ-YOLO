import { apiFetch } from './client';

export interface Round {
  id: string;
  courseId?: string | null;
  courseName?: string | null;
  teeName?: string | null;
  holes: number;
  startHole?: number;
  status?: 'in_progress' | 'completed';
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

  tempoBackswingMs?: number | null;
  tempoDownswingMs?: number | null;
  tempoRatio?: number | null;
}

export type FairwayResult = 'hit' | 'left' | 'right' | 'long' | 'short';
export type PuttDistanceBucket = '0_1m' | '1_3m' | '3_10m' | '10m_plus';

export interface HoleScore {
  holeNumber: number;
  par?: number | null;
  strokes?: number | null;
  putts?: number | null;
  penalties?: number | null;
  fairwayHit?: boolean | null;
  fairwayResult?: FairwayResult | null;
  gir?: boolean | null;
  firstPuttDistanceBucket?: PuttDistanceBucket | null;
}

export interface RoundScores {
  roundId: string;
  playerId?: string;
  holes: Record<number, HoleScore>;
}

export interface RoundSummary {
  roundId: string;
  playerId?: string;
  totalStrokes?: number | null;
  totalPar?: number | null;
  totalToPar?: number | null;
  frontStrokes?: number | null;
  backStrokes?: number | null;
  totalPutts?: number | null;
  totalPenalties?: number | null;
  teeShots?: number | null;
  approachShots?: number | null;
  shortGameShots?: number | null;
  puttingShots?: number | null;
  penalties?: number | null;
  fairwaysHit?: number | null;
  fairwaysTotal?: number | null;
  fairwayMissLeft?: number | null;
  fairwayMissRight?: number | null;
  fairwayMissLong?: number | null;
  fairwayMissShort?: number | null;
  girCount?: number | null;
  firstPuttBucketCounts?: Partial<Record<PuttDistanceBucket, number>>;
  firstPuttBucketThreePutts?: Partial<Record<PuttDistanceBucket, number>>;
  holesPlayed: number;
}

export interface RoundSummaryWithRoundInfo extends RoundSummary {
  courseId?: string | null;
  teeName?: string | null;
  holes: number;
  startedAt: string;
  endedAt?: string | null;
}

export type RoundRecapCategory = {
  label: string;
  grade: string | null;
  value: number | null;
};

export type RoundRecap = {
  roundId: string;
  courseName?: string | null;
  date: string;
  score: number | null;
  toPar: string | null;
  holesPlayed: number;
  categories: {
    driving?: RoundRecapCategory;
    approach?: RoundRecapCategory;
    short_game?: RoundRecapCategory;
    putting?: RoundRecapCategory;
  };
  focusHints: string[];
};

export interface RoundInfo {
  id: string;
  playerId?: string;
  courseId?: string | null;
  courseName?: string | null;
  teeName?: string | null;
  holes: number;
  startHole?: number;
  status?: 'in_progress' | 'completed';
  lastHole?: number | null;
  startedAt: string;
  endedAt?: string | null;
}

export async function startRound(req: {
  courseId?: string;
  teeName?: string;
  holes?: number;
  startHole?: number;
}): Promise<Round> {
  return apiFetch<Round>('/api/rounds/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function getCurrentRound(): Promise<RoundInfo | null> {
  return apiFetch<RoundInfo | null>('/api/rounds/current');
}

export async function fetchCurrentRound(): Promise<RoundInfo | null> {
  return getCurrentRound();
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
    tempoBackswingMs?: number;
    tempoDownswingMs?: number;
    tempoRatio?: number;
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

export async function getRoundScores(roundId: string): Promise<RoundScores> {
  const response = await apiFetch<RoundScores>(`/api/rounds/${roundId}/scores`);
  return {
    ...response,
    holes: Object.fromEntries(
      Object.entries(response.holes ?? {}).map(([key, value]) => [Number(key), value]),
    ),
  };
}

export async function updateHoleScore(
  roundId: string,
  holeNumber: number,
  payload: Partial<HoleScore>,
): Promise<RoundScores> {
  const response = await apiFetch<RoundScores>(`/api/rounds/${roundId}/scores/${holeNumber}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return {
    ...response,
    holes: Object.fromEntries(
      Object.entries(response.holes ?? {}).map(([key, value]) => [Number(key), value]),
    ),
  };
}

export async function getRoundSummary(roundId: string): Promise<RoundSummary> {
  return apiFetch<RoundSummary>(`/api/rounds/${roundId}/summary`);
}

export async function fetchRoundRecap(roundId: string): Promise<RoundRecap> {
  return apiFetch<RoundRecap>(`/api/rounds/${roundId}/recap`);
}

export async function listRounds(limit?: number): Promise<RoundInfo[]> {
  const query = limit ? `?limit=${limit}` : '';
  return apiFetch<RoundInfo[]>(`/api/rounds${query}`);
}

export async function listRoundSummaries(limit?: number): Promise<RoundSummary[]> {
  const query = limit ? `?limit=${limit}` : '';
  return apiFetch<RoundSummary[]>(`/api/rounds/summaries${query}`);
}

export async function fetchLatestCompletedRound(): Promise<RoundSummaryWithRoundInfo | null> {
  return apiFetch<RoundSummaryWithRoundInfo | null>('/api/rounds/latest');
}

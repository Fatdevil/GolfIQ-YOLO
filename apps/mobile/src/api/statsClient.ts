import { apiFetch } from './client';

export interface PlayerCategoryStats {
  playerId: string;
  roundsCount: number;

  teeShots: number;
  approachShots: number;
  shortGameShots: number;
  putts: number;
  penalties: number;

  avgTeeShotsPerRound?: number | null;
  avgApproachShotsPerRound?: number | null;
  avgShortGameShotsPerRound?: number | null;
  avgPuttsPerRound?: number | null;

  teePct?: number | null;
  approachPct?: number | null;
  shortGamePct?: number | null;
  puttingPct?: number | null;
}

export async function fetchPlayerCategoryStats(): Promise<PlayerCategoryStats> {
  return apiFetch<PlayerCategoryStats>('/api/stats/player/categories');
}

import { apiFetch } from '@app/api/client';

export interface ClubDistanceStats {
  club: string;
  samples: number;
  baselineCarryM: number;
  carryStdM?: number | null;
  lastUpdated: string;
}

export async function fetchClubDistances(): Promise<ClubDistanceStats[]> {
  return apiFetch<ClubDistanceStats[]>('/api/player/club-distances');
}

import { apiFetch } from '@app/api/client';

export interface ClubDistanceStats {
  club: string;
  samples: number;
  baselineCarryM: number;
  carryStdM?: number | null;
  lastUpdated: string;

  manualCarryM?: number | null;
  source: 'auto' | 'manual';
}

export async function fetchClubDistances(): Promise<ClubDistanceStats[]> {
  return apiFetch<ClubDistanceStats[]>('/api/player/club-distances');
}

export async function setClubDistanceOverride(
  club: string,
  manualCarryM: number,
  source: 'auto' | 'manual' = 'manual',
): Promise<ClubDistanceStats> {
  return apiFetch<ClubDistanceStats>(`/api/player/club-distances/${club}/override`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manualCarryM, source }),
  });
}

export async function clearClubDistanceOverride(club: string): Promise<ClubDistanceStats> {
  return apiFetch<ClubDistanceStats>(`/api/player/club-distances/${club}/override`, {
    method: 'DELETE',
  });
}

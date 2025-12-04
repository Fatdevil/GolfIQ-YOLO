import { apiFetch } from '@app/api/client';

export type ClubDistance = {
  clubId: string;
  label: string;
  avgCarryM: number | null;
  stdDevM?: number | null;
  sampleCount: number;
  active: boolean;
  manualAvgCarryM?: number | null;
};

export type PlayerBag = {
  clubs: ClubDistance[];
};

export async function fetchPlayerBag(): Promise<PlayerBag> {
  return apiFetch<PlayerBag>('/api/player/bag');
}

export type ClubUpdate = {
  clubId: string;
  label?: string;
  active?: boolean;
  manualAvgCarryM?: number | null;
};

export async function updatePlayerClubs(updates: ClubUpdate[]): Promise<PlayerBag> {
  return apiFetch<PlayerBag>('/api/player/bag/clubs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

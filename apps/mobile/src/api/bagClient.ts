import { apiFetch } from '@app/api/client';
import type { PlayerBag, PlayerBagClub } from '@shared/caddie/playerBag';

export type ClubDistance = PlayerBagClub;
export type { PlayerBag };

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

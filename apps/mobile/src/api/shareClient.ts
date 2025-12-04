import { apiFetch } from './client';

export type ShareLink = { url: string; sid?: string };

export async function createRoundShareLink(roundId: string): Promise<ShareLink> {
  return apiFetch<ShareLink>(`/api/share/round/${roundId}`, {
    method: 'POST',
  });
}

export async function createWeeklyShareLink(): Promise<ShareLink> {
  return apiFetch<ShareLink>('/api/share/weekly', {
    method: 'POST',
  });
}


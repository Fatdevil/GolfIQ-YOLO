import { resolveApiBase } from '@app/config';
import type { GrossNetMode, SpectatorBoardPlayer, TvFlags } from '@shared/events/types';

type JoinResponse = {
  eventId: string;
};

type SpectatorBoardResponse = {
  players: SpectatorBoardPlayer[];
  updatedAt: string | null;
  grossNet?: GrossNetMode;
  tvFlags?: TvFlags | null;
  participants?: number;
  spectators?: number;
  qrSvg?: string | null;
};

function headers(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

export async function joinByCode(code: string): Promise<JoinResponse> {
  const response = await fetch(`${resolveApiBase()}/join/${encodeURIComponent(code)}`, {
    method: 'POST',
    headers: headers(),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to join event');
  }
  return (await response.json()) as JoinResponse;
}

export async function fetchBoard(eventId: string): Promise<SpectatorBoardResponse> {
  const response = await fetch(`${resolveApiBase()}/events/${encodeURIComponent(eventId)}/board`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to load live board');
  }
  return (await response.json()) as SpectatorBoardResponse;
}

import { resolveApiBase } from '@app/config';
import type { GrossNetMode, SpectatorBoardPlayer, TvFlags } from '@shared/events/types';

export type PostScoreResult =
  | { ok: true; idempotent?: boolean; revision: number }
  | { ok: false; retry?: 'bump'; currentRevision?: number; reason?: string; status: number };

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

export type PostScoreArgs = {
  eventId: string;
  scorecardId: string;
  hole: number;
  strokes: number;
  putts?: number | null;
  revision?: number | null;
  fingerprint: string;
};

export async function postScore(args: PostScoreArgs): Promise<PostScoreResult> {
  const response = await fetch(`${resolveApiBase()}/events/${encodeURIComponent(args.eventId)}/score`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args),
  });

  if (response.ok) {
    const json = await response.json().catch(() => ({}));
    return {
      ok: true,
      idempotent: json?.idempotent === true ? true : undefined,
      revision: typeof json?.revision === 'number' ? json.revision : args.revision ?? 1,
    };
  }

  if (response.status === 409) {
    const data = await response.json().catch(() => ({}));
    const detail = data?.detail;
    const currentRevision = detail?.currentRevision;
    if (detail?.reason === 'STALE_OR_DUPLICATE' && Number.isFinite(currentRevision)) {
      return {
        ok: false,
        retry: 'bump',
        currentRevision: Number(currentRevision),
        reason: detail.reason,
        status: 409,
      };
    }
  }

  return { ok: false, status: response.status };
}

export type ClipCommentaryResponse = {
  title: string;
  summary: string;
  ttsUrl?: string | null;
};

export async function requestClipCommentary(clipId: string): Promise<ClipCommentaryResponse> {
  const response = await fetch(`${resolveApiBase()}/events/clips/${encodeURIComponent(clipId)}/commentary`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'x-event-role': 'admin',
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to generate commentary');
  }

  return (await response.json()) as ClipCommentaryResponse;
}

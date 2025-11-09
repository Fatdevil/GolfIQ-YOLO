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

export type ClipReactions = {
  counts: Record<string, number>;
  recentCount: number;
  total: number;
};

export type ShotClip = {
  id: string;
  eventId: string;
  playerId: string;
  roundId?: string | null;
  hole?: number | null;
  status: string;
  srcUri?: string | null;
  hlsUrl?: string | null;
  mp4Url?: string | null;
  thumbUrl?: string | null;
  durationMs?: number | null;
  fingerprint?: string | null;
  visibility: string;
  createdAt: string | null;
  reactions: ClipReactions;
  weight: number;
};

export type ClipListResponse = {
  items: ShotClip[];
};

export async function fetchClips(
  eventId: string,
  params: { after?: string; limit?: number } = {},
): Promise<ClipListResponse> {
  const url = new URL(`${resolveApiBase()}/events/${encodeURIComponent(eventId)}/clips`);
  if (params.after) {
    url.searchParams.set('after', params.after);
  }
  if (params.limit) {
    url.searchParams.set('limit', String(params.limit));
  }
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to load clips');
  }
  return (await response.json()) as ClipListResponse;
}

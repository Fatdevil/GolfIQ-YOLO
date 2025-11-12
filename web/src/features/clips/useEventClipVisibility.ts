import * as React from 'react';

import { getApiKey } from '@web/api';
import type { EventSession } from '@web/session/eventSession';

import { normalizeClipVisibility, type ClipVisibility } from './visibilityPolicy';

type ClipFeedEntry = {
  id?: string;
  clipId?: string;
  hidden?: boolean | null;
  visibility?: string | null;
};

type UseEventClipVisibilityResult = {
  map: Map<string, ClipVisibility>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  get: (clipId: string) => ClipVisibility | undefined;
};

function resolveClipId(entry: ClipFeedEntry | null | undefined): string | null {
  if (!entry) {
    return null;
  }
  const candidates = [entry.id, entry.clipId];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

async function fetchClipFeed(
  eventId: string,
  session: Pick<EventSession, 'role' | 'memberId'>,
  signal?: AbortSignal,
): Promise<Map<string, ClipVisibility>> {
  const headers: Record<string, string> = {};
  const apiKey = getApiKey();
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  if (session.role) {
    headers['x-event-role'] = session.role;
  }
  if (session.memberId) {
    headers['x-event-member'] = session.memberId;
  }

  const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/clips-feed`, {
    headers,
    signal,
  });
  if (!response.ok) {
    throw new Error(`failed to load clip visibility (${response.status})`);
  }
  const payload = (await response.json()) as ClipFeedEntry[];
  const map = new Map<string, ClipVisibility>();
  payload.forEach((entry) => {
    const clipId = resolveClipId(entry);
    if (!clipId) {
      return;
    }
    map.set(clipId, normalizeClipVisibility({ hidden: entry?.hidden, visibility: entry?.visibility ?? null }));
  });
  return map;
}

export function useEventClipVisibility(eventId: string | null | undefined, session: EventSession): UseEventClipVisibilityResult {
  const [map, setMap] = React.useState<Map<string, ClipVisibility>>(() => new Map());
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const role = session.role;
  const memberId = session.memberId;

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      if (!eventId) {
        setMap(new Map());
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const next = await fetchClipFeed(eventId, { role, memberId }, signal);
        if (signal?.aborted) {
          return;
        }
        setMap(next);
        setError(null);
      } catch (err) {
        if (signal?.aborted) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to load clip visibility';
        setError(message);
        setMap(new Map());
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [eventId, role, memberId],
  );

  React.useEffect(() => {
    if (!eventId) {
      setMap(new Map());
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [eventId, load]);

  const refresh = React.useCallback(() => {
    void load();
  }, [load]);

  const get = React.useCallback(
    (clipId: string) => {
      if (typeof clipId !== 'string' || !clipId.trim()) {
        return undefined;
      }
      return map.get(clipId.trim());
    },
    [map],
  );

  return { map, loading, error, refresh, get };
}

export type { ClipVisibility };

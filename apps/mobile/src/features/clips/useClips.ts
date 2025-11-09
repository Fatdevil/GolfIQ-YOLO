import { useEffect, useMemo, useRef, useState } from 'react';

import { fetchClips, type ShotClip } from '@app/api/events';

export type UseClipsResult = {
  clips: ShotClip[];
  loading: boolean;
  error: string | null;
};

const DEFAULT_POLL_MS = 4000;

function mergeClips(existing: ShotClip[], incoming: ShotClip[]): ShotClip[] {
  if (incoming.length === 0) {
    return existing;
  }
  const map = new Map<string, ShotClip>();
  for (const clip of existing) {
    map.set(clip.id, clip);
  }
  for (const clip of incoming) {
    map.set(clip.id, clip);
  }
  return Array.from(map.values());
}

export function useClips(eventId: string, pollMs: number = DEFAULT_POLL_MS): UseClipsResult {
  const [clips, setClips] = useState<ShotClip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!eventId) {
      return () => undefined;
    }
    let cancelled = false;

    const run = async () => {
      if (cancelled) {
        return;
      }
      try {
        setLoading(true);
        const response = await fetchClips(eventId, { limit: 50 });
        if (cancelled) {
          return;
        }
        setClips((current) => {
          const merged = mergeClips(current, response.items);
          return merged.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
        });
        setError(null);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unable to load clips';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          if (timerRef.current) {
            clearTimeout(timerRef.current);
          }
          timerRef.current = setTimeout(run, pollMs);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [eventId, pollMs]);

  const ordered = useMemo(
    () => clips.slice().sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)),
    [clips],
  );

  return { clips: ordered, loading, error };
}

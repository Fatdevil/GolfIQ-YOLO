import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchEventClips, postClipReaction } from "@web/api";
import type { ShotClip } from "@web/features/clips/types";

type UseClipsOptions = {
  pollMs?: number;
  memberId?: string;
  role?: "spectator" | "player" | "admin";
  enabled?: boolean;
};

type UseClipsResult = {
  clips: ShotClip[];
  topShots: ShotClip[];
  loading: boolean;
  error: string | null;
  react: (clipId: string, emoji: string) => Promise<void>;
};

const DEFAULT_POLL_MS = 2000;

function dedupeClips(existing: ShotClip[], incoming: ShotClip[]): ShotClip[] {
  if (incoming.length === 0) {
    return existing;
  }
  const next = new Map<string, ShotClip>();
  for (const clip of existing) {
    next.set(clip.id, clip);
  }
  for (const clip of incoming) {
    next.set(clip.id, clip);
  }
  return Array.from(next.values()).sort((a, b) => {
    const aDate = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bDate = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bDate - aDate;
  });
}

export function useClips(eventId: string, options: UseClipsOptions = {}): UseClipsResult {
  const [clips, setClips] = useState<ShotClip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchedAt = useRef<string | null>(null);

  useEffect(() => {
    if (!eventId || options.enabled === false) {
      return () => undefined;
    }
    let cancelled = false;

    const schedule = (delay: number) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(run, delay);
    };

    const run = async () => {
      if (cancelled) {
        return;
      }
      try {
        setLoading(true);
        const response = await fetchEventClips(eventId, {
          after: lastFetchedAt.current ?? undefined,
          limit: 50,
        });
        if (cancelled) {
          return;
        }
        if (response.items.length > 0) {
          const newest = response.items[0];
          if (newest.createdAt) {
            lastFetchedAt.current = newest.createdAt;
          }
        }
        setClips((current) => dedupeClips(current, response.items));
        setError(null);
        schedule(pollMs);
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : "Unable to load clips";
        setError(message);
        schedule(pollMs * 2);
      } finally {
        if (!cancelled) {
          setLoading(false);
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
  }, [eventId, pollMs, options.enabled]);

  const react = useCallback(
    async (clipId: string, emoji: string) => {
      await postClipReaction(clipId, emoji, {
        memberId: options.memberId,
        role: options.role,
      });
      setClips((current) =>
        current.map((clip) => {
          if (clip.id !== clipId) {
            return clip;
          }
          const counts = { ...clip.reactions.counts };
          counts[emoji] = (counts[emoji] ?? 0) + 1;
          return {
            ...clip,
            reactions: {
              counts,
              total: clip.reactions.total + 1,
              recentCount: clip.reactions.recentCount + 1,
            },
            weight: clip.weight + 1,
          };
        }),
      );
    },
    [options.memberId, options.role],
  );

  const topShots = useMemo(() => {
    return [...clips].sort((a, b) => {
      const weightDelta = (b.weight ?? 0) - (a.weight ?? 0);
      if (Math.abs(weightDelta) > 0.001) {
        return weightDelta;
      }
      const aDate = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bDate = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bDate - aDate;
    });
  }, [clips]);

  return { clips, topShots, loading, error, react };
}

export type { ShotClip } from "@web/features/clips/types";

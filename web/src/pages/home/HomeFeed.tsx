import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { formatSgDelta } from "@web/features/clips/ClipCard";

import {
  fetchHomeFeed,
  type HomeFeedLiveEvent,
  type HomeFeedResponse,
  type HomeFeedTopShot,
} from "@web/features/feed/api";
import {
  emitFeedClickClip,
  emitFeedClickWatch,
  emitFeedHomeRendered,
  emitFeedHomeRequested,
} from "@web/features/feed/telemetry";
import { preloadImage } from "@web/utils/preload";

const DEFAULT_LIMIT = 20;
const POSITIVE_THRESHOLD = 0.05;

type LoadOptions = {
  refresh?: boolean;
};

export default function HomeFeed(): JSX.Element {
  const [data, setData] = useState<HomeFeedResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const isMountedRef = useRef(true);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const load = useCallback(
    async (options: LoadOptions = {}): Promise<void> => {
      emitFeedHomeRequested({ limit: DEFAULT_LIMIT });
      if (!isMountedRef.current) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await fetchHomeFeed({ limit: DEFAULT_LIMIT, bustCache: options.refresh });
        if (!isMountedRef.current) {
          return;
        }
        setData(result);
        emitFeedHomeRendered({ topCount: result.topShots.length, liveCount: result.live.length });
      } catch (err) {
        if (!isMountedRef.current) {
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to load feed";
        setError(message);
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(() => {
    void load({ refresh: true });
  }, [load]);

  const handlePlayClip = useCallback(
    (shot: HomeFeedTopShot) => {
      emitFeedClickClip({ clipId: shot.clipId, eventId: shot.eventId, anchorSec: shot.anchorSec });
      const anchor = Number.isFinite(shot.anchorSec) ? Math.max(0, shot.anchorSec) : 0;
      const params = new URLSearchParams();
      params.set("clip", shot.clipId);
      params.set("t", anchor.toString());
      const basePath = shot.eventId ? `/events/${shot.eventId}/top-shots` : `/clips/${shot.clipId}`;
      navigate(`${basePath}?${params.toString()}`);
    },
    [navigate],
  );

  const handleWatchLive = useCallback(
    (event: HomeFeedLiveEvent) => {
      emitFeedClickWatch({ eventId: event.eventId, livePath: event.livePath });
      const params = new URLSearchParams();
      params.set("source", "feed");
      navigate(`/events/${event.eventId}/live-view?${params.toString()}`);
    },
    [navigate],
  );

  const topShots = data?.topShots ?? [];
  const liveEvents = data?.live ?? [];

  const updatedLabel = useMemo(() => formatTimestamp(data?.updatedAt ?? null), [data?.updatedAt]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 text-slate-100">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Home feed</h1>
          <p className="text-sm text-slate-400">
            Catch the latest top shots ranked by reactions, strokes-gained impact, and see who is live right now.
          </p>
          {updatedLabel ? (
            <p className="text-xs text-slate-500">Updated {updatedLabel}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="self-start rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh feed"}
        </button>
      </header>

      {error ? <p className="rounded border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Top Shots</h2>
          <span className="text-xs uppercase tracking-wide text-slate-500">Limit {DEFAULT_LIMIT}</span>
        </div>

        {loading && topShots.length === 0 ? <TopShotSkeletonList /> : null}

        {!loading && topShots.length === 0 ? (
          <div className="rounded border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-400">
            No top shots yet. Check back soon!
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {topShots.map((shot) => (
            <TopShotCard key={shot.clipId} shot={shot} onPlay={handlePlayClip} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Live Now</h2>
        </div>

        {loading && liveEvents.length === 0 ? <LiveSkeleton /> : null}

        {!loading && liveEvents.length === 0 ? (
          <div className="rounded border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-400">
            No live events at the moment.
          </div>
        ) : null}

        <div className="grid gap-4">
          {liveEvents.map((event) => (
            <LiveEventCard key={event.eventId} event={event} onWatch={() => handleWatchLive(event)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function formatTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString();
}

function resolveBadgeClass(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "bg-slate-800 text-slate-200";
  }
  if (value > POSITIVE_THRESHOLD) {
    return "bg-emerald-500 text-emerald-50";
  }
  if (value < -POSITIVE_THRESHOLD) {
    return "bg-rose-500 text-rose-50";
  }
  return "bg-slate-800 text-slate-200";
}

type TopShotCardProps = {
  shot: HomeFeedTopShot;
  onPlay?: (shot: HomeFeedTopShot) => void;
};

export function TopShotCard({ shot, onPlay }: TopShotCardProps): JSX.Element {
  const sgLabel = formatSgDelta(shot.sgDelta ?? null);
  const createdLabel = useMemo(() => formatTimestamp(shot.createdAt ?? null), [shot.createdAt]);
  const reactionsLabel = `${shot.reactions1min} in 1m • ${shot.reactionsTotal} total`;
  const scoreLabel = Number.isFinite(shot.rankScore) ? `Score ${shot.rankScore.toFixed(2)}` : null;
  const anchorLabel = `${Math.max(0, Math.round((shot.anchorSec ?? 0) * 10) / 10)}s`;
  const thumb = shot.thumbUrl ?? null;

  const handlePreload = useCallback(() => {
    preloadImage(thumb);
  }, [thumb]);

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
      {thumb ? (
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/80">
          <img src={thumb} alt={`Preview for clip ${shot.clipId}`} className="aspect-video w-full object-cover" />
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-slate-500">{shot.eventId ?? "Top shot"}</span>
          <h3 className="text-lg font-semibold text-slate-100">Clip {shot.clipId}</h3>
          {createdLabel ? <span className="text-xs text-slate-400">{createdLabel}</span> : null}
        </div>
        {sgLabel ? (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${resolveBadgeClass(shot.sgDelta ?? null)}`}>
            {sgLabel}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        <span>{reactionsLabel}</span>
        {scoreLabel ? <span>{scoreLabel}</span> : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-4">
        <span className="text-sm text-slate-300">Anchor {anchorLabel}</span>
        <button
          type="button"
          onClick={() => onPlay?.(shot)}
          onMouseEnter={handlePreload}
          onFocus={handlePreload}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
        >
          Play from anchor
        </button>
      </div>
    </div>
  );
}

type LiveEventCardProps = {
  event: HomeFeedLiveEvent;
  onWatch: () => void;
};

function LiveEventCard({ event, onWatch }: LiveEventCardProps): JSX.Element {
  const startedLabel = useMemo(() => formatTimestamp(event.startedAt ?? null), [event.startedAt]);
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rose-300">
          <span className="text-rose-400">● Live</span>
          {startedLabel ? <span className="text-slate-500">since {startedLabel}</span> : null}
        </div>
        <h3 className="text-xl font-semibold">Event {event.eventId}</h3>
        <p className="text-sm text-slate-400">{event.viewers} viewer{event.viewers === 1 ? "" : "s"}</p>
      </div>
      <button
        type="button"
        onClick={onWatch}
        className="self-start rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 md:self-auto"
      >
        Watch
      </button>
    </div>
  );
}

function TopShotSkeletonList(): JSX.Element {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div
          key={idx}
          className="h-36 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60"
        />
      ))}
    </div>
  );
}

function LiveSkeleton(): JSX.Element {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 2 }).map((_, idx) => (
        <div
          key={idx}
          className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60"
        />
      ))}
    </div>
  );
}

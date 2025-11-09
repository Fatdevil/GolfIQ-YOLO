import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { fetchSpectatorBoard, type SpectatorBoardPlayer, type SpectatorBoardResponse } from '@web/api';
import { createBackoffController } from '@shared/events/resync';
import { emitEventsTvRotate, emitEventsTvTick } from '@shared/events/telemetry';
import type { GrossNetMode, TvFlags, UUID } from '@shared/events/types';

const DEFAULT_ROTATION_MS = 6500;

function normalizeTvFlags(flags: TvFlags | null | undefined): TvFlags {
  return {
    showQrOverlay: !!flags?.showQrOverlay,
    autoRotateTop: flags?.autoRotateTop !== false,
    rotateIntervalMs: flags?.rotateIntervalMs ?? undefined,
  };
}

function formatUpdatedAt(updatedAt: string | null): string {
  if (!updatedAt) return '—';
  try {
    const date = new Date(updatedAt);
    return date.toLocaleTimeString();
  } catch {
    return '—';
  }
}

function computeStats(players: SpectatorBoardPlayer[]) {
  if (!players.length) {
    return {
      total: 0,
      playing: 0,
      finished: 0,
      avgThru: 0,
      avgGross: 0,
    };
  }
  let playing = 0;
  let finished = 0;
  let thruSum = 0;
  let grossSum = 0;
  for (const player of players) {
    if (player.status === 'finished') {
      finished += 1;
    } else {
      playing += 1;
    }
    thruSum += Number.isFinite(player.thru) ? player.thru : 0;
    grossSum += Number.isFinite(player.gross) ? player.gross : 0;
  }
  return {
    total: players.length,
    playing,
    finished,
    avgThru: Math.round((thruSum / players.length) * 10) / 10,
    avgGross: Math.round((grossSum / players.length) * 10) / 10,
  };
}

export default function EventTvBoard(): JSX.Element {
  const params = useParams<{ id: string }>();
  const eventId = params.id ?? '';
  const [board, setBoard] = useState<SpectatorBoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'stats'>('board');
  const [rotationPenalty, setRotationPenalty] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTick = useRef<number>(Date.now());
  const backoff = useMemo(
    () =>
      createBackoffController({
        baseMs: 250,
        maxMs: 1500,
        successMs: 1500,
        successMaxMs: 2500,
        jitter: 0.25,
      }),
    [],
  );

  useEffect(() => {
    if (!eventId) {
      return;
    }
    let cancelled = false;

    const schedule = (delay: number) => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
      pollingRef.current = setTimeout(run, delay);
    };

    const run = async () => {
      if (cancelled) {
        return;
      }
      try {
        const response = await fetchSpectatorBoard(eventId);
        if (cancelled) {
          return;
        }
        setBoard(response);
        setError(null);
        const now = Date.now();
        emitEventsTvTick({ eventId: eventId as UUID, durationMs: now - lastTick.current });
        lastTick.current = now;
        const delay = backoff.success();
        setRotationPenalty(0);
        schedule(delay);
      } catch (err) {
        if (cancelled) {
          return;
        }
        const delay = backoff.failure();
        setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
        setRotationPenalty((prev) => Math.min(prev + 1, 3));
        schedule(delay);
      }
    };

    schedule(0);

    return () => {
      cancelled = true;
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
      if (rotationRef.current) {
        clearTimeout(rotationRef.current);
        rotationRef.current = null;
      }
      backoff.reset();
    };
  }, [backoff, eventId]);

  const tvFlags = normalizeTvFlags(board?.tvFlags ?? null);
  const grossNet: GrossNetMode = board?.grossNet ?? 'net';
  const tvFlagsRef = useRef(tvFlags);

  useEffect(() => {
    tvFlagsRef.current = tvFlags;
  }, [tvFlags]);

  useEffect(() => {
    if (!tvFlags.autoRotateTop) {
      if (view !== 'board') {
        setView('board');
      }
      if (rotationRef.current) {
        clearTimeout(rotationRef.current);
        rotationRef.current = null;
      }
      return;
    }
    const base = tvFlags.rotateIntervalMs ?? DEFAULT_ROTATION_MS;
    const interval = Math.min(base + rotationPenalty * 2000, 12000);
    if (rotationRef.current) {
      clearTimeout(rotationRef.current);
    }
    rotationRef.current = setTimeout(() => {
      if (!tvFlagsRef.current.autoRotateTop) {
        return;
      }
      setView((prev) => {
        const next = prev === 'board' ? 'stats' : 'board';
        emitEventsTvRotate({
          eventId: eventId as UUID,
          intervalMs: interval,
          view: next,
        });
        return next;
      });
    }, interval);
    return () => {
      if (rotationRef.current) {
        clearTimeout(rotationRef.current);
        rotationRef.current = null;
      }
    };
  }, [eventId, rotationPenalty, tvFlags.autoRotateTop, tvFlags.rotateIntervalMs, view]);

  const players = board?.players ?? [];
  const topFive = useMemo(() => players.slice(0, 5), [players]);
  const stats = useMemo(() => computeStats(players), [players]);
  const updatedAt = formatUpdatedAt(board?.updatedAt ?? null);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-slate-950 p-8 text-slate-50">
      {error && <div className="absolute top-4 rounded bg-rose-600 px-4 py-2 text-sm font-semibold">{error}</div>}
      <div className="mb-6 text-center">
        <h1 className="text-5xl font-black tracking-wide">Live Leaderboard</h1>
        <p className="mt-2 text-lg text-slate-300">
          Showing {grossNet === 'gross' ? 'Gross' : 'Net'} · Updated {updatedAt}
        </p>
      </div>
      <div className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
        <div
          data-testid="tv-board-panel"
          className={clsx(
            'transition-opacity duration-700',
            view === 'board' ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <table className="w-full table-fixed">
            <thead>
              <tr className="text-left text-2xl uppercase tracking-widest text-slate-400">
                <th className="pb-4">Player</th>
                <th className="pb-4 text-right">Gross</th>
                <th className="pb-4 text-right">Net</th>
                <th className="pb-4 text-right">Thru</th>
              </tr>
            </thead>
            <tbody>
              {topFive.length === 0 && (
                <tr>
                  <td className="py-6 text-center text-2xl text-slate-400" colSpan={4}>
                    Waiting for players…
                  </td>
                </tr>
              )}
              {topFive.map((player, index) => (
                <tr key={`${player.name}-${index}`} className="text-3xl font-semibold text-slate-100">
                  <td className="py-3 pr-4">
                    <span className="mr-3 text-2xl text-slate-500">{index + 1}</span>
                    {player.name}
                  </td>
                  <td className="py-3 text-right">{player.gross}</td>
                  <td className="py-3 text-right">{player.net ?? '—'}</td>
                  <td className="py-3 text-right">{player.thru}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          data-testid="tv-stats-panel"
          className={clsx(
            'absolute inset-0 flex flex-col items-center justify-center gap-6 bg-slate-900/95 transition-opacity duration-700',
            view === 'stats' ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <h2 className="text-4xl font-bold text-teal-300">Ball Flight Snapshot</h2>
          <div className="grid w-full max-w-3xl grid-cols-2 gap-6 text-center text-3xl font-semibold text-slate-100">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow">
              <p className="text-sm uppercase tracking-widest text-slate-500">Players on course</p>
              <p className="mt-2 text-5xl font-black text-teal-300">{stats.playing}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow">
              <p className="text-sm uppercase tracking-widest text-slate-500">Rounds finished</p>
              <p className="mt-2 text-5xl font-black text-amber-300">{stats.finished}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow">
              <p className="text-sm uppercase tracking-widest text-slate-500">Average holes played</p>
              <p className="mt-2 text-5xl font-black text-slate-100">{stats.avgThru}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6 shadow">
              <p className="text-sm uppercase tracking-widest text-slate-500">Average gross</p>
              <p className="mt-2 text-5xl font-black text-slate-100">{stats.avgGross}</p>
            </div>
          </div>
          <p className="text-lg text-slate-400">Total players tracked: {stats.total}</p>
        </div>
      </div>
      {tvFlags.showQrOverlay && board?.qrSvg && (
        <div className="pointer-events-none absolute bottom-8 right-8 flex items-center gap-4 rounded-3xl bg-slate-900/90 p-4 shadow-xl">
          <div className="rounded-xl bg-white p-3" aria-hidden dangerouslySetInnerHTML={{ __html: board.qrSvg }} />
          <div className="text-right">
            <p className="text-sm uppercase tracking-widest text-slate-400">Join the event</p>
            <p className="text-2xl font-semibold text-slate-100">Scan to follow live</p>
          </div>
        </div>
      )}
    </div>
  );
}

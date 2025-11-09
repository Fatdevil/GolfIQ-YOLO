import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { fetchSpectatorBoard, type SpectatorBoardResponse } from '@web/api';
import { createBackoffController } from '@shared/events/resync';
import { emitEventsLiveTick, emitEventsResync } from '@shared/events/telemetry';
import type { SpectatorPlayer } from '@shared/events/spectator';
import type { SpectatorBoardPlayer as ApiSpectatorPlayer, UUID } from '@shared/events/types';
import ClipBadge from '@web/features/clips/ClipBadge';
import ClipModal from '@web/features/clips/ClipModal';
import TopShotsPanel from '@web/features/clips/TopShotsPanel';
import { useClips } from '@web/features/clips/useClips';
import type { ShotClip } from '@web/features/clips/types';

type BoardState = SpectatorBoardResponse;

export default function LiveLeaderboardPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const eventId = params.id ?? '';
  const [board, setBoard] = useState<BoardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTick = useRef<number>(Date.now());
  const backoff = useMemo(
    () =>
      createBackoffController({
        baseMs: 100,
        maxMs: 800,
        successMs: 1200,
        successMaxMs: 2000,
        jitter: 0.5,
      }),
    [],
  );

  useEffect(() => {
    if (!eventId) {
      return () => undefined;
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
        emitEventsLiveTick({ eventId: eventId as UUID, durationMs: now - lastTick.current });
        lastTick.current = now;
        schedule(backoff.success());
      } catch (err) {
        if (cancelled) {
          return;
        }
        const delay = backoff.failure();
        const message = err instanceof Error ? err.message : 'Failed to load leaderboard';
        setError(message);
        emitEventsResync({
          eventId: eventId as UUID,
          delayMs: delay,
          attempt: backoff.attempts(),
          reason: message,
        });
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
      backoff.reset();
    };
  }, [backoff, eventId]);

  const players: SpectatorPlayer[] = (board?.players ?? []).map((player: ApiSpectatorPlayer) => ({
    name: player.name,
    gross: player.gross,
    net: player.net ?? undefined,
    thru: player.thru,
    hole: player.hole,
    status: player.status ?? undefined,
  }));

  const {
    clips,
    topShots,
    loading: clipsLoading,
    error: clipsError,
    react,
  } = useClips(eventId, { enabled: Boolean(eventId) });
  const [selectedClip, setSelectedClip] = useState<ShotClip | null>(null);

  const openTopClip = useCallback(() => {
    if (topShots.length > 0) {
      setSelectedClip(topShots[0]);
    }
  }, [topShots]);

  const handleReact = useCallback(
    async (clip: ShotClip, emoji: string) => {
      try {
        await react(clip.id, emoji);
      } catch (err) {
        console.warn('Failed to react to clip', err);
      }
    },
    [react],
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">Live Leaderboard</h1>
          <ClipBadge count={clips.length} onClick={openTopClip} />
        </div>
        {board?.updatedAt && (
          <p className="mt-2 text-sm text-slate-300">Updated {new Date(board.updatedAt).toLocaleTimeString()}</p>
        )}
        {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
        {clipsError && clips.length === 0 && (
          <p className="mt-2 text-sm text-rose-300">{clipsError}</p>
        )}
      </header>
      <div className="overflow-hidden rounded-lg bg-slate-900 shadow">
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="bg-slate-800 text-xs uppercase tracking-wide text-slate-300">
            <tr>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Gross</th>
              <th className="px-4 py-3">Net</th>
              <th className="px-4 py-3">Thru</th>
              <th className="px-4 py-3">Hole</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {players.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-400" colSpan={6}>
                  Waiting for players…
                </td>
              </tr>
            )}
            {players.map((player, index) => (
              <tr key={`${player.name}-${index}`} className="text-slate-100">
                <td className="px-4 py-3 font-semibold">{player.name}</td>
                <td className="px-4 py-3">{player.gross}</td>
                <td className="px-4 py-3">{player.net ?? '—'}</td>
                <td className="px-4 py-3">{player.thru}</td>
                <td className="px-4 py-3">{player.hole}</td>
                <td className="px-4 py-3 text-slate-300">{player.status ?? 'playing'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TopShotsPanel
        clips={topShots}
        loading={clipsLoading}
        error={clipsError}
        onSelect={setSelectedClip}
        onReact={handleReact}
      />
      <ClipModal clip={selectedClip} open={Boolean(selectedClip)} onClose={() => setSelectedClip(null)} />
    </div>
  );
}

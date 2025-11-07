import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import type { LiveSpectatorPlayer, LiveSpectatorShot, LiveSpectatorSnapshot } from "@shared/events/types";
import { pollLiveRoundSnapshot } from "@shared/events/service";
import { isSupabaseConfigured } from "@shared/supabase/client";

function formatScoreValue(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) {
    return "—";
  }
  const numeric = Number(value);
  if (numeric > 0) {
    return `+${numeric}`;
  }
  return `${numeric}`;
}

function formatPlaysLike(value: number | null | undefined): string | null {
  if (!Number.isFinite(value ?? NaN)) {
    return null;
  }
  const numeric = Number(value);
  const rounded = Math.round(numeric * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

function ShotCard({ shot }: { shot: LiveSpectatorShot }): JSX.Element {
  const carryLabel = useMemo(() => {
    if (!Number.isFinite(shot.carry ?? NaN)) {
      return null;
    }
    return `${Math.round(Number(shot.carry))} m carry`;
  }, [shot.carry]);

  const playsLike = useMemo(() => formatPlaysLike(shot.playsLikePct), [shot.playsLikePct]);

  const sgLabel = useMemo(() => {
    if (!Number.isFinite(shot.strokesGained ?? NaN)) {
      return null;
    }
    const numeric = Number(shot.strokesGained);
    const rounded = Math.round(numeric * 10) / 10;
    const sign = rounded > 0 ? "+" : "";
    return `SG ${sign}${rounded}`;
  }, [shot.strokesGained]);

  const footer = useMemo(() => {
    const segments: string[] = [];
    if (playsLike) {
      segments.push(`PL ${playsLike}`);
    }
    if (sgLabel) {
      segments.push(sgLabel);
    }
    return segments.join(" • ");
  }, [playsLike, sgLabel]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm text-slate-300">
        <span className="font-semibold text-slate-100">Hole {shot.hole}</span>
        {shot.updatedAt ? <span className="text-xs text-slate-500">{new Date(shot.updatedAt).toLocaleTimeString()}</span> : null}
      </div>
      <div className="mt-3 text-lg font-semibold text-slate-50">
        {shot.club ? shot.club.toUpperCase() : "Shot"}
      </div>
      {carryLabel ? <div className="mt-1 text-sm text-slate-300">{carryLabel}</div> : null}
      {footer ? <div className="mt-3 text-xs uppercase tracking-wide text-slate-500">{footer}</div> : null}
    </div>
  );
}

function LeaderboardRow({ player, format }: { player: LiveSpectatorPlayer; format: "stroke" | "stableford" }): JSX.Element {
  const metricValue = format === "stableford" ? player.stableford ?? "—" : player.net ?? "—";
  const scoreLabel = formatScoreValue(player.toPar ?? null);
  const thruLabel = player.thru > 0 ? `${player.thru}` : "—";

  return (
    <div className="grid grid-cols-6 items-center gap-4 border-b border-slate-800 px-4 py-3 text-sm text-slate-200">
      <div className="col-span-2 flex flex-col">
        <span className="font-semibold text-slate-50">{player.name}</span>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
          {Number.isFinite(player.playingHandicap ?? NaN) ? (
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-200">PH {player.playingHandicap}</span>
          ) : null}
          {Number.isFinite(player.whsIndex ?? NaN) ? (
            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-slate-300">WHS {Number(player.whsIndex).toFixed(1)}</span>
          ) : null}
        </div>
      </div>
      <div className="text-center font-mono text-base text-slate-100">{player.gross}</div>
      <div className="text-center font-mono text-base text-slate-100">{metricValue}</div>
      <div className="text-center font-mono text-base text-slate-100">{scoreLabel}</div>
      <div className="text-center font-mono text-base text-slate-100">{thruLabel}</div>
    </div>
  );
}

export default function LiveRoundRoute(): JSX.Element {
  const { eventId, roundId } = useParams<{ eventId: string; roundId: string }>();
  const [snapshot, setSnapshot] = useState<LiveSpectatorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId || !roundId) {
      setError("Live link not found");
      setLoading(false);
      return;
    }
    if (!isSupabaseConfigured()) {
      setError("Live scoring is not available.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    let stopPolling: (() => void) | null = null;
    setLoading(true);
    setError(null);
    setSnapshot(null);

    (async () => {
      try {
        stopPolling = await pollLiveRoundSnapshot(eventId, roundId, (next) => {
          if (cancelled) {
            return;
          }
          setSnapshot(next);
          setError(null);
          setLoading(false);
        }, 5000);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unable to load live scores";
          setError(message);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (stopPolling) {
        stopPolling();
      }
    };
  }, [eventId, roundId]);

  const format = snapshot?.format ?? "stroke";
  const players = snapshot?.players ?? [];
  const shots = snapshot?.topShots ?? [];
  const metricHeader = format === "stableford" ? "Pts" : "Net";
  const scoreHeader = "To Par";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-4 py-12 text-slate-100">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
          {snapshot?.event.name ?? "Live leaderboard"}
        </h1>
        <p className="text-sm text-slate-400">
          {format === "stableford" ? "Stableford scoring" : "Stroke play"}
          {snapshot?.event.status ? ` • ${snapshot.event.status}` : ""}
        </p>
        {snapshot?.updatedAt ? (
          <p className="text-xs text-slate-500">Updated {new Date(snapshot.updatedAt).toLocaleTimeString()}</p>
        ) : null}
      </header>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-8 text-center text-slate-300">
          Loading live scores…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 shadow-lg">
          <div className="grid grid-cols-6 gap-4 border-b border-slate-800 px-4 py-3 text-xs uppercase tracking-wide text-slate-400">
            <span className="col-span-2">Player</span>
            <span className="text-center">Gross</span>
            <span className="text-center">{metricHeader}</span>
            <span className="text-center">{scoreHeader}</span>
            <span className="text-center">Thru</span>
          </div>
          {players.length ? (
            <div className="divide-y divide-slate-800">
              {players.map((player) => (
                <LeaderboardRow key={player.id} player={player} format={format} />
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-slate-400">No scores yet. Check back soon.</div>
          )}
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-50">Top shots</h2>
            <span className="text-xs uppercase tracking-wide text-slate-500">Auto-refreshed</span>
          </div>
          {shots.length ? (
            <div className="grid gap-4 md:grid-cols-3">
              {shots.map((shot) => (
                <ShotCard key={shot.id} shot={shot} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-6 text-sm text-slate-400">
              Highlights will appear as shots are recorded.
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

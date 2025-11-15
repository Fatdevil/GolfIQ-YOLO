import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { TripHoleScore, TripPlayer } from "../../trip/types";
import { API } from "../../api";
import { useTripSSE } from "../../trip/useTripSSE";

type PublicTripRound = {
  course_name: string;
  tees_name?: string | null;
  holes: number;
  created_ts: number;
  players: TripPlayer[];
  scores: TripHoleScore[];
};

export default function PublicTripScoreboardPage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();

  const [trip, setTrip] = useState<PublicTripRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sseUrl = useMemo(() => {
    if (!token) {
      return null;
    }
    try {
      return new URL(`${API}/public/trip/rounds/${token}/stream`).toString();
    } catch {
      return `${API}/public/trip/rounds/${token}/stream`;
    }
  }, [token]);

  const liveTrip = useTripSSE(sseUrl);
  const effectiveTrip = liveTrip ?? trip;

  useEffect(() => {
    if (!token) {
      setError(t("trip.public.notFound"));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API}/public/trip/rounds/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(res.status === 404 ? "not_found" : String(res.status));
        }
        const data = (await res.json()) as PublicTripRound;
        if (!cancelled) {
          setTrip(data);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        if (err instanceof Error && err.message === "not_found") {
          setError(t("trip.public.notFound"));
        } else {
          setError(t("trip.public.notFound"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const holes = useMemo(() => {
    if (!effectiveTrip) {
      return [];
    }
    return Array.from({ length: effectiveTrip.holes }, (_, index) => index + 1);
  }, [effectiveTrip]);

  const scoresByKey = useMemo(() => {
    if (!effectiveTrip) {
      return {} as Record<string, number | undefined>;
    }
    const map: Record<string, number | undefined> = {};
    for (const score of effectiveTrip.scores) {
      if (typeof score.strokes === "number") {
        map[`${score.hole}:${score.player_id}`] = score.strokes;
      }
    }
    return map;
  }, [effectiveTrip]);

  const leaderboard = useMemo(() => {
    if (!effectiveTrip) {
      return [] as {
        id: string;
        name: string;
        gross: number | null;
        handicap: number | null;
        net: number | null;
      }[];
    }
    const totals = new Map<string, number>();
    for (const score of effectiveTrip.scores) {
      if (typeof score.strokes === "number") {
        totals.set(
          score.player_id,
          (totals.get(score.player_id) ?? 0) + score.strokes
        );
      }
    }
    return effectiveTrip.players
      .map((player) => {
        const gross = totals.has(player.id) ? totals.get(player.id)! : null;
        const handicap =
          typeof player.handicap === "number" && Number.isFinite(player.handicap)
            ? player.handicap
            : null;
        const net = gross !== null ? gross - (handicap ?? 0) : null;
        return {
          id: player.id,
          name: player.name,
          gross,
          handicap,
          net,
        };
      })
      .sort((a, b) => {
        if (a.net === null && b.net === null) {
          if (a.gross === null && b.gross === null) {
            return 0;
          }
          if (a.gross === null) {
            return 1;
          }
          if (b.gross === null) {
            return -1;
          }
          return a.gross - b.gross;
        }
        if (a.net === null) {
          return 1;
        }
        if (b.net === null) {
          return -1;
        }
        if (a.net === b.net) {
          if (a.gross === null && b.gross === null) {
            return 0;
          }
          if (a.gross === null) {
            return 1;
          }
          if (b.gross === null) {
            return -1;
          }
          return a.gross - b.gross;
        }
        return a.net - b.net;
      });
  }, [effectiveTrip]);

  const createdAt = useMemo(() => {
    if (!effectiveTrip) {
      return "";
    }
    return new Date(effectiveTrip.created_ts * 1000).toLocaleString();
  }, [effectiveTrip]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-4 text-slate-300">
        {t("trip.public.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6 text-center text-slate-300">
        <p>{error}</p>
        <Link
          to="/"
          className="inline-flex items-center rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-slate-200"
        >
          {t("trip.public.openApp")}
        </Link>
      </div>
    );
  }

  if (!effectiveTrip) {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4">
      <header className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
        <h1 className="text-2xl font-semibold text-slate-100">
          {effectiveTrip.course_name}
          {effectiveTrip.tees_name ? ` • ${effectiveTrip.tees_name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-slate-300">{createdAt}</p>
        <p className="text-xs text-slate-400">
          {effectiveTrip.holes} {effectiveTrip.holes === 1 ? "hole" : "holes"}
        </p>
        {liveTrip ? (
          <span className="mt-3 inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            {t("trip.public.liveUpdating", "Watching live")}
          </span>
        ) : null}
      </header>

      <section className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <table className="min-w-full divide-y divide-slate-800 text-sm text-slate-200">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-300">
                {t("trip.scoreboard.hole")}
              </th>
              {effectiveTrip.players.map((player) => (
                <th
                  key={player.id}
                  className="px-3 py-2 text-left font-semibold text-slate-300"
                >
                  {player.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holes.map((hole) => (
              <tr key={hole} className="odd:bg-slate-900/30">
                <td className="px-3 py-2 text-left text-slate-400">{hole}</td>
                {effectiveTrip.players.map((player) => (
                  <td key={player.id} className="px-3 py-2">
                    {scoresByKey[`${hole}:${player.id}`] ?? "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold text-slate-100">
          {t("trip.scoreboard.total")}
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm text-slate-200">
            <thead className="bg-slate-900/40 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-semibold text-slate-300">
                  {t("trip.leaderboard.player", "Player")}
                </th>
                <th className="px-3 py-2 font-semibold text-slate-300">
                  {t("trip.leaderboard.gross")}
                </th>
                <th className="px-3 py-2 font-semibold text-slate-300">
                  {t("trip.leaderboard.handicap")}
                </th>
                <th className="px-3 py-2 font-semibold text-slate-300">
                  {t("trip.leaderboard.net")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {leaderboard.map((entry) => (
                <tr key={entry.id} className="odd:bg-slate-900/40">
                  <td className="px-3 py-2 font-semibold text-slate-100">{entry.name}</td>
                  <td className="px-3 py-2">{entry.gross ?? "-"}</td>
                  <td className="px-3 py-2">
                    {entry.handicap !== null ? entry.handicap.toFixed(1) : "-"}
                  </td>
                  <td className="px-3 py-2 font-semibold text-emerald-300">
                    {entry.net !== null ? entry.net.toFixed(1) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

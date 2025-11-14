import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { TripHoleScore, TripPlayer } from "../../trip/types";

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

  useEffect(() => {
    if (!token) {
      setError(t("trip.public.notFound"));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/public/trip/rounds/${token}`)
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
    if (!trip) {
      return [];
    }
    return Array.from({ length: trip.holes }, (_, index) => index + 1);
  }, [trip]);

  const scoresByKey = useMemo(() => {
    if (!trip) {
      return {} as Record<string, number | undefined>;
    }
    const map: Record<string, number | undefined> = {};
    for (const score of trip.scores) {
      if (typeof score.strokes === "number") {
        map[`${score.hole}:${score.player_id}`] = score.strokes;
      }
    }
    return map;
  }, [trip]);

  const leaderboard = useMemo(() => {
    if (!trip) {
      return [] as { name: string; strokes: number | null }[];
    }
    const totals = new Map<string, number>();
    for (const score of trip.scores) {
      if (typeof score.strokes === "number") {
        totals.set(
          score.player_id,
          (totals.get(score.player_id) ?? 0) + score.strokes
        );
      }
    }
    return trip.players
      .map((player) => ({
        name: player.name,
        strokes: totals.has(player.id) ? totals.get(player.id)! : null,
      }))
      .sort((a, b) => {
        if (a.strokes === null && b.strokes === null) {
          return 0;
        }
        if (a.strokes === null) {
          return 1;
        }
        if (b.strokes === null) {
          return -1;
        }
        return a.strokes - b.strokes;
      });
  }, [trip]);

  const createdAt = useMemo(() => {
    if (!trip) {
      return "";
    }
    return new Date(trip.created_ts * 1000).toLocaleString();
  }, [trip]);

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

  if (!trip) {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4">
      <header className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
        <h1 className="text-2xl font-semibold text-slate-100">
          {trip.course_name}
          {trip.tees_name ? ` • ${trip.tees_name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-slate-300">{createdAt}</p>
        <p className="text-xs text-slate-400">
          {trip.holes} {trip.holes === 1 ? "hole" : "holes"}
        </p>
      </header>

      <section className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <table className="min-w-full divide-y divide-slate-800 text-sm text-slate-200">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-300">
                {t("trip.scoreboard.hole")}
              </th>
              {trip.players.map((player) => (
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
                {trip.players.map((player) => (
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
        <ul className="mt-3 space-y-2 text-sm text-slate-200">
          {leaderboard.map((entry) => (
            <li key={entry.name} className="flex items-center justify-between">
              <span>{entry.name}</span>
              <span>{entry.strokes ?? "-"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

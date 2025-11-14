import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import {
  createTripShareToken,
  fetchTripRound,
  saveTripScores,
  TripApiError,
} from "../../trip/api";
import type { TripRound } from "../../trip/types";

export default function TripScoreboardPage() {
  const { t } = useTranslation();
  const { tripId } = useParams<{ tripId: string }>();

  const [trip, setTrip] = useState<TripRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, number | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) {
      setLoadError(t("trip.scoreboard.notFound"));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchTripRound(tripId)
      .then((data) => {
        if (!cancelled) {
          setTrip(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof TripApiError && err.status === 404) {
            setLoadError(t("trip.scoreboard.notFound"));
          } else {
            setLoadError(
              err instanceof Error ? err.message : t("trip.scoreboard.notFound")
            );
          }
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
  }, [tripId, t]);

  const scoresByKey = useMemo(() => {
    const map: Record<string, number | undefined> = {};
    if (trip) {
      for (const score of trip.scores) {
        if (typeof score.strokes === "number") {
          map[`${score.hole}:${score.player_id}`] = score.strokes;
        }
      }
    }
    return map;
  }, [trip]);

  const holes = useMemo(() => {
    if (!trip) {
      return [];
    }
    return Array.from({ length: trip.holes }, (_, index) => index + 1);
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

  const handleScoreChange = (key: string, value: string) => {
    setPending((prev) => ({
      ...prev,
      [key]: value === "" ? undefined : Number(value),
    }));
  };

  const handleSave = async () => {
    if (!trip) {
      return;
    }
    setSaveError(null);
    const updates = Object.entries(pending)
      .filter(([, value]) => typeof value === "number" && !Number.isNaN(value))
      .map(([key, strokes]) => {
        const [holeStr, playerId] = key.split(":");
        return {
          hole: Number(holeStr),
          player_id: playerId,
          strokes: strokes!,
        };
      });

    if (updates.length === 0) {
      return;
    }

    setSaving(true);
    try {
      const updated = await saveTripScores(trip.id, updates);
      setTrip(updated);
      setPending({});
    } catch (err) {
      if (err instanceof TripApiError && err.status === 404) {
        setSaveError(t("trip.scoreboard.notFound"));
      } else {
        setSaveError(
          err instanceof Error ? err.message : t("trip.scoreboard.saveError")
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCreateShare = async () => {
    if (!trip) {
      return;
    }

    try {
      setShareError(null);
      const token = await createTripShareToken(trip.id);
      const url = `${window.location.origin}/trip/share/${token}`;
      setShareUrl(url);
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
        } catch (clipboardError) {
          console.warn("Failed to copy share link", clipboardError);
        }
      }
    } catch (err) {
      console.error(err);
      setShareUrl(null);
      setShareError(t("trip.share.error"));
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-4 text-slate-300">
        {t("trip.scoreboard.loading")}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 text-slate-300">
        <p>{loadError}</p>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="mx-auto max-w-5xl p-4 text-slate-300">
        {t("trip.scoreboard.notFound")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4">
      <header className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">
              {t("trip.scoreboard.title")}
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              {trip.course_name}
              {trip.tees_name ? ` • ${trip.tees_name}` : ""}
            </p>
            <p className="text-xs text-slate-400">
              {t("trip.scoreboard.holesLabel", { count: trip.holes })}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={handleCreateShare}
            >
              {t("trip.share.button")}
            </button>
            {shareUrl ? (
              <p className="max-w-xs break-words text-xs text-emerald-300 sm:text-right">
                {t("trip.share.copied")}
                <br />
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-200 underline"
                >
                  {shareUrl}
                </a>
              </p>
            ) : null}
            {shareError ? (
              <p className="text-xs text-rose-300 sm:text-right">{shareError}</p>
            ) : null}
          </div>
        </div>
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
          <tbody className="divide-y divide-slate-800">
            {holes.map((hole) => (
              <tr key={hole}>
                <td className="px-3 py-2 font-semibold text-slate-300">{hole}</td>
                {trip.players.map((player) => {
                  const key = `${hole}:${player.id}`;
                  const pendingValue = pending[key];
                  const existingValue = scoresByKey[key];
                  const value = pendingValue ?? existingValue ?? "";
                  return (
                    <td key={player.id} className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        max={15}
                        value={value}
                        onChange={(event) => handleScoreChange(key, event.target.value)}
                        aria-label={t("trip.scoreboard.cellLabel", {
                          hole,
                          player: player.name,
                        })}
                        className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? t("trip.scoreboard.saving") : t("trip.scoreboard.save")}
          </button>
        </div>
        {saveError && (
          <p className="mt-2 text-sm text-rose-400">{saveError}</p>
        )}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-lg font-semibold text-slate-100">
          {t("trip.scoreboard.total")}
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-200">
          {leaderboard.map((entry) => (
            <li
              key={entry.name}
              className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/40 px-3 py-2"
            >
              <span>{entry.name}</span>
              <span className="font-semibold text-emerald-300">
                {entry.strokes === null ? "—" : entry.strokes}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

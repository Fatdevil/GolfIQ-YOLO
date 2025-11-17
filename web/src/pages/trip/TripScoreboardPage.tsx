import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { BetaBadge } from "@/access/BetaBadge";
import { useNotifications } from "@/notifications/NotificationContext";

import {
  createTripShareToken,
  fetchTripRound,
  saveTripScores,
  TripApiError,
} from "../../trip/api";
import type { TripRound } from "../../trip/types";
import { API, getApiKey } from "../../api";
import { useTripSSE } from "../../trip/useTripSSE";

export default function TripScoreboardPage() {
  const { t } = useTranslation();
  const { tripId } = useParams<{ tripId: string }>();
  const { notify } = useNotifications();

  const [trip, setTrip] = useState<TripRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, number | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  const sseUrl = useMemo(() => {
    if (!trip) {
      return null;
    }
    const apiKey = getApiKey();
    try {
      const url = new URL(`${API}/api/trip/rounds/${trip.id}/stream`);
      if (apiKey) {
        url.searchParams.set("apiKey", apiKey);
      }
      return url.toString();
    } catch {
      const query = apiKey ? `?apiKey=${encodeURIComponent(apiKey)}` : "";
      return `${API}/api/trip/rounds/${trip.id}/stream${query}`;
    }
  }, [trip]);

  const liveTrip = useTripSSE(sseUrl);
  const effectiveTrip = liveTrip ?? trip;

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
    if (effectiveTrip) {
      for (const score of effectiveTrip.scores) {
        if (typeof score.strokes === "number") {
          map[`${score.hole}:${score.player_id}`] = score.strokes;
        }
      }
    }
    return map;
  }, [effectiveTrip]);

  const holes = useMemo(() => {
    if (!effectiveTrip) {
      return [];
    }
    return Array.from({ length: effectiveTrip.holes }, (_, index) => index + 1);
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

  const handleScoreChange = (key: string, value: string) => {
    setPending((prev) => ({
      ...prev,
      [key]: value === "" ? undefined : Number(value),
    }));
  };

  const handleSave = async () => {
    if (!effectiveTrip) {
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
      const updated = await saveTripScores(effectiveTrip.id, updates);
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
    if (!effectiveTrip) {
      return;
    }

    try {
      setShareError(null);
      const token = await createTripShareToken(effectiveTrip.id);
      const url = `${window.location.origin}/trip/share/${token}`;
      setShareUrl(url);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
      notify("success", t("trip.share.copied"));
    } catch (err) {
      console.error(err);
      setShareError(t("trip.share.error"));
      notify("error", t("trip.share.error"));
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

  if (!effectiveTrip) {
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
              {effectiveTrip.course_name}
              {effectiveTrip.tees_name ? ` • ${effectiveTrip.tees_name}` : ""}
            </p>
            <p className="text-xs text-slate-400">
              {t("trip.scoreboard.holesLabel", { count: effectiveTrip.holes })}
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
            {liveTrip ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1">
                <span className="text-xs font-semibold text-emerald-300">
                  {t("trip.scoreboard.liveUpdating", "Live updating")}
                </span>
                <BetaBadge />
              </div>
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
          <tbody className="divide-y divide-slate-800">
            {holes.map((hole) => (
              <tr key={hole}>
                <td className="px-3 py-2 font-semibold text-slate-300">{hole}</td>
                {effectiveTrip.players.map((player) => {
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
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm text-slate-200">
            <thead className="bg-slate-900/50 text-left text-xs uppercase tracking-wide text-slate-400">
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
                  <td className="px-3 py-2">
                    {entry.gross !== null ? entry.gross : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {entry.handicap !== null ? entry.handicap.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-2 font-semibold text-emerald-300">
                    {entry.net !== null ? entry.net.toFixed(1) : "—"}
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

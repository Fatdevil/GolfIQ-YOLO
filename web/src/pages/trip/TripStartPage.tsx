import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useCourseBundle, useCourseIds } from "../../courses/hooks";
import { createTripRound, TripApiError } from "../../trip/api";
import {
  clearTripDefaultHandicap,
  loadTripDefaultHandicap,
  saveTripDefaultHandicap,
} from "../../trip/storage";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

type PlayerRow = {
  name: string;
  handicap: string;
};

export default function TripStartPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const defaultTripHandicap = useMemo(() => loadTripDefaultHandicap(), []);
  const defaultHandicapString =
    defaultTripHandicap != null ? String(defaultTripHandicap) : "";

  const [courseName, setCourseName] = useState("");
  const [courseId, setCourseId] = useState<string | undefined>();
  const [teesName, setTeesName] = useState("");
  const [holes, setHoles] = useState<9 | 18>(18);
  const [players, setPlayers] = useState<PlayerRow[]>(() =>
    Array.from({ length: MIN_PLAYERS }, () => ({
      name: "",
      handicap: defaultHandicapString,
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    data: courseIds,
    loading: courseIdsLoading,
    error: courseIdsError,
  } = useCourseIds();
  const { data: selectedBundle } = useCourseBundle(courseId);

  useEffect(() => {
    if (selectedBundle && courseName.trim().length === 0) {
      setCourseName(selectedBundle.name);
    }
  }, [selectedBundle, courseName]);

  const handlePlayerNameChange = (index: number, value: string) => {
    setPlayers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], name: value };
      return next;
    });
  };

  const handlePlayerHandicapChange = (index: number, value: string) => {
    setPlayers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], handicap: value };
      return next;
    });
  };

  const handleAddPlayer = () => {
    setPlayers((prev) => {
      if (prev.length >= MAX_PLAYERS) {
        return prev;
      }
      const templateHandicap = prev[0]?.handicap ?? defaultHandicapString;
      return [...prev, { name: "", handicap: templateHandicap }];
    });
  };

  const handleRemovePlayer = (index: number) => {
    setPlayers((prev) => {
      if (prev.length <= MIN_PLAYERS) {
        return prev;
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedCourseName = courseName.trim();
    if (!trimmedCourseName) {
      setError(t("trip.start.courseNameRequired"));
      return;
    }

    const playerPayloads = players
      .map((player) => {
        const name = player.name.trim();
        if (!name) {
          return null;
        }
        const handicapTrimmed = player.handicap.trim();
        let handicapValue: number | null = null;
        if (handicapTrimmed) {
          const parsed = Number(handicapTrimmed);
          handicapValue = Number.isFinite(parsed) ? parsed : null;
        }
        return { name, handicap: handicapValue };
      })
      .filter(
        (
          player
        ): player is { name: string; handicap: number | null } => player !== null
      );

    if (playerPayloads.length < MIN_PLAYERS) {
      setError(t("trip.start.playersRequired", { count: MIN_PLAYERS }));
      return;
    }

    const firstHandicap = playerPayloads.find(
      (player) => typeof player.handicap === "number"
    )?.handicap;

    if (typeof firstHandicap === "number") {
      saveTripDefaultHandicap(firstHandicap);
    } else {
      clearTripDefaultHandicap();
    }

    setSubmitting(true);
    try {
      const round = await createTripRound({
        courseName: trimmedCourseName,
        courseId,
        teesName: teesName.trim() || undefined,
        holes,
        players: playerPayloads,
      });
      navigate(`/trip/${round.id}`);
    } catch (err) {
      if (err instanceof TripApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : t("trip.start.genericError"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-10 p-4">
      <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-6 shadow-lg">
        <h1 className="text-2xl font-semibold text-slate-100">
          {t("trip.start.title")}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {t("trip.start.subtitle")}
        </p>
        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-slate-200"
              htmlFor="courseName"
            >
              {t("trip.start.courseName")}
            </label>
            <input
              id="courseName"
              type="text"
              value={courseName}
              onChange={(event) => setCourseName(event.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              placeholder={t("trip.start.courseNamePlaceholder")}
              required
            />
          </div>
          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-slate-200"
              htmlFor="courseId"
            >
              {t("trip.start.demoCourse")}
            </label>
            {courseIdsLoading ? (
              <p className="text-xs text-slate-400">{t("trip.start.loadingCourses")}</p>
            ) : courseIdsError ? (
              <p className="text-xs text-rose-400">{t("trip.start.failedCourses")}</p>
            ) : (
              <select
                id="courseId"
                value={courseId ?? ""}
                onChange={(event) =>
                  setCourseId(event.target.value ? event.target.value : undefined)
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              >
                <option value="">{t("trip.start.noDemoCourse")}</option>
                {(courseIds ?? []).map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            )}
            {courseId && selectedBundle && (
              <p className="text-xs text-slate-400">
                {selectedBundle.name} ({selectedBundle.country})
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200" htmlFor="teesName">
              {t("trip.start.tees")}
            </label>
            <input
              id="teesName"
              type="text"
              value={teesName}
              onChange={(event) => setTeesName(event.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              placeholder={t("trip.start.teesPlaceholder")}
            />
          </div>
          <div className="space-y-3">
            <span className="block text-sm font-medium text-slate-200">
              {t("trip.start.holes")}
            </span>
            <div className="flex gap-4">
              {[9, 18].map((count) => (
                <label
                  key={count}
                  className="flex cursor-pointer items-center gap-2 text-sm text-slate-200"
                >
                  <input
                    type="radio"
                    name="holes"
                    value={count}
                    checked={holes === count}
                    onChange={() => setHoles(count as 9 | 18)}
                    className="h-4 w-4 border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  {t("trip.start.holesOption", { count })}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <span className="block text-sm font-medium text-slate-200">
              {t("trip.start.players")}
            </span>
            <div className="space-y-3">
              {players.map((player, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded border border-slate-800 bg-slate-950/50 p-3 sm:flex-row sm:items-center sm:gap-3"
                >
                  <input
                    type="text"
                    value={player.name}
                    onChange={(event) =>
                      handlePlayerNameChange(index, event.target.value)
                    }
                    className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    placeholder={t("trip.start.playerPlaceholder", { index: index + 1 })}
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400" htmlFor={`player-handicap-${index}`}>
                      {t("trip.start.handicap")}
                    </label>
                    <input
                      id={`player-handicap-${index}`}
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={player.handicap}
                      onChange={(event) =>
                        handlePlayerHandicapChange(index, event.target.value)
                      }
                      className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      placeholder="12.0"
                    />
                  </div>
                  {players.length > MIN_PLAYERS && index >= MIN_PLAYERS && (
                    <button
                      type="button"
                      onClick={() => handleRemovePlayer(index)}
                      className="self-start rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-rose-400 hover:text-rose-300 sm:self-center"
                    >
                      {t("trip.start.removePlayer")}
                    </button>
                  )}
                </div>
              ))}
            </div>
            {players.length < MAX_PLAYERS && (
              <button
                type="button"
                onClick={handleAddPlayer}
                className="rounded border border-slate-700 px-3 py-1 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-emerald-300"
              >
                {t("trip.start.addPlayer")}
              </button>
            )}
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? t("trip.start.starting") : t("trip.start.startButton")}
          </button>
        </form>
      </section>
    </div>
  );
}

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import {
  fetchBundleIndex,
  fetchHeroCourses,
  type BundleIndexItem,
  type HeroCourseSummary,
  type HeroCourseTee,
} from "@/api";
import {
  createRoundId,
  loadAllRounds,
  loadDefaultHandicap,
  saveDefaultHandicap,
  clearDefaultHandicap,
  saveRound,
  QuickRoundSummary,
} from "../../features/quickround/storage";
import { QuickRound } from "../../features/quickround/types";

export const DEMO_COURSE_NAME = "Demo Links Hero";

function readStoredMemberId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem("event.memberId");
  } catch {
    return null;
  }
}

export default function QuickRoundStartPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [courseName, setCourseName] = useState(DEMO_COURSE_NAME);
  const [teesName, setTeesName] = useState("");
  const [holesCount, setHolesCount] = useState<9 | 18>(18);
  const [showPutts, setShowPutts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<QuickRoundSummary[]>([]);
  const [courses, setCourses] = useState<BundleIndexItem[]>([]);
  const [heroCourses, setHeroCourses] = useState<HeroCourseSummary[]>([]);
  const [selectedHeroCourseId, setSelectedHeroCourseId] =
    useState<string>();
  const [selectedHeroTeeId, setSelectedHeroTeeId] = useState<string>();
  const [selectedCourseId, setSelectedCourseId] = useState<string | undefined>();
  const [handicapInput, setHandicapInput] = useState<string>(() => {
    const stored = loadDefaultHandicap();
    return stored != null ? String(stored) : "";
  });

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("sv-SE", {
        dateStyle: "short",
        timeStyle: "short",
      }),
    []
  );

  useEffect(() => {
    const summaries = loadAllRounds().sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    setRounds(summaries);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchBundleIndex()
      .then((list) => {
        if (!cancelled) {
          setCourses(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCourses([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchHeroCourses()
      .then((list) => {
        if (!cancelled) {
          setHeroCourses(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHeroCourses([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const selected = courses.find((course) => course.courseId === selectedCourseId);
    if (selected) {
      setCourseName(selected.name);
    }
  }, [selectedCourseId, courses]);

  useEffect(() => {
    const selectedHero = heroCourses.find((course) => course.id === selectedHeroCourseId);
    if (!selectedHero) {
      return;
    }

    setSelectedCourseId(selectedHero.id);
    setCourseName(selectedHero.name);

    if (selectedHero.tees.length > 0) {
      const preferredTee =
        selectedHero.tees.find((tee) => tee.id === selectedHeroTeeId) || selectedHero.tees[0];
      if (preferredTee) {
        setSelectedHeroTeeId(preferredTee.id);
        if (teesName.trim().length === 0) {
          setTeesName(preferredTee.label);
        }
      }
    }
  }, [selectedHeroCourseId, selectedHeroTeeId, heroCourses, teesName]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedCourse = courses.find((course) => course.courseId === selectedCourseId);
    const trimmedCourseName = courseName.trim();
    const finalCourseName = trimmedCourseName || selectedCourse?.name || "";
    const finalCourseId = selectedCourse?.courseId ?? selectedCourseId;
    const selectedHero = heroCourses.find((course) => course.id === selectedHeroCourseId);

    if (!finalCourseName) {
      setError(t("quickRound.start.courseNameRequired"));
      return;
    }
    const trimmedTeesName = teesName.trim();
    const heroHoleMetadata = selectedHero?.holeDetails;
    let holes: QuickRound["holes"];
    if (heroHoleMetadata && heroHoleMetadata.length > 0) {
      holes = heroHoleMetadata.map((hole, index) => ({
        index: hole.number ?? index + 1,
        par: hole.par ?? 4,
      }));
    } else if (selectedHero?.holes) {
      holes = Array.from({ length: selectedHero.holes }, (_, index) => ({
        index: index + 1,
        par: 4,
      }));
    } else {
      holes = Array.from({ length: holesCount }, (_, index) => ({
        index: index + 1,
        par: 4,
      }));
    }
    const trimmedHandicap = handicapInput.trim();
    let handicap: number | undefined;
    if (trimmedHandicap) {
      const parsed = Number(trimmedHandicap);
      if (Number.isFinite(parsed)) {
        handicap = parsed;
        saveDefaultHandicap(parsed);
      }
    } else {
      clearDefaultHandicap();
    }
    const roundId = createRoundId();
    const round: QuickRound = {
      id: roundId,
      runId: roundId,
      courseName: finalCourseName,
      courseId: finalCourseId,
      teesName: trimmedTeesName || undefined,
      holes,
      startedAt: new Date().toISOString(),
      showPutts,
      handicap,
      memberId: readStoredMemberId(),
    };
    saveRound(round);
    navigate(`/play/${round.id}`);
  };

  return (
    <div className="space-y-10">
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 shadow-lg">
        <h1 className="text-2xl font-semibold text-slate-100">
          {t("quickRound.start.title")}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Starta en snabb solo-runda utan eventkod. Dina resultat sparas lokalt på den här enheten.
        </p>
        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200" htmlFor="courseName">
              {t("quickRound.start.courseName")}
            </label>
            <input
              id="courseName"
              type="text"
              value={courseName}
              onChange={(event) => {
                setCourseName(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              className="w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              placeholder="Ex: Bro Hof Slottsbana"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200" htmlFor="courseId">
              {t("quickround.course.label")}
            </label>
            <select
              id="courseId"
              value={selectedCourseId ?? ""}
              onChange={(event) => {
                const value = event.target.value ? event.target.value : undefined;
                setSelectedHeroCourseId(undefined);
                setSelectedHeroTeeId(undefined);
                setSelectedCourseId(value);
                if (error && (value || courseName.trim().length > 0)) {
                  setError(null);
                }
              }}
              className="w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              <option value="">{t("quickround.course.none")}</option>
              {courses.map((course) => (
                <option key={course.courseId} value={course.courseId}>
                  {course.name} ({course.holes})
                </option>
              ))}
            </select>
          </div>
          {heroCourses.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200">
                  {t("quickRound.start.heroCourses")}
                </span>
                <span className="text-xs text-slate-400">
                  {t("quickRound.start.heroCoursesHelp")}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {heroCourses.map((course) => {
                  const selected = course.id === selectedHeroCourseId;
                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => {
                        setSelectedHeroCourseId(course.id);
                        setSelectedHeroTeeId(course.tees[0]?.id);
                        setError(null);
                      }}
                      className={`rounded border px-4 py-3 text-left transition ${
                        selected
                          ? "border-emerald-400 bg-emerald-500/10"
                          : "border-slate-800 bg-slate-950/50 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-100">{course.name}</div>
                          <div className="text-xs text-slate-400">
                            {[course.city, course.country].filter(Boolean).join(", ")}
                          </div>
                        </div>
                        <div className="text-right text-xs text-slate-300">
                          <div>{course.holes} hål</div>
                          <div>Par {course.par}</div>
                        </div>
                      </div>
                      {course.tees.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-300">
                          {course.tees.map((tee) => (
                            <span
                              key={tee.id}
                              className="rounded-full border border-slate-700 px-2 py-0.5"
                            >
                              {tee.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedHeroCourseId && (
                <HeroTeeSelector
                  course={heroCourses.find((course) => course.id === selectedHeroCourseId)}
                  selectedTeeId={selectedHeroTeeId}
                  onSelectTee={(tee) => {
                    setSelectedHeroTeeId(tee.id);
                    setTeesName(tee.label);
                  }}
                />
              )}
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200" htmlFor="teesName">
              {t("quickRound.start.teesName")}
            </label>
            <input
              id="teesName"
              type="text"
              value={teesName}
              onChange={(event) => setTeesName(event.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              placeholder="Ex: Gul"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200" htmlFor="handicap">
              {t("quickRound.start.handicap")}
            </label>
            <input
              id="handicap"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={handicapInput}
              onChange={(event) => setHandicapInput(event.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              placeholder="14.3"
            />
            <p className="text-xs text-slate-400">
              {t("quickRound.start.handicapHelp")}
            </p>
          </div>
          <div className="space-y-3">
            <span className="block text-sm font-medium text-slate-200">
              {t("quickRound.start.holes")}
            </span>
            <div className="flex gap-4">
              {[9, 18].map((count) => (
                <label key={count} className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                  <input
                    type="radio"
                    name="holesCount"
                    value={count}
                    checked={holesCount === count}
                    onChange={() => setHolesCount(count as 9 | 18)}
                    className="h-4 w-4 border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  {t("quickRound.start.holesOption", { count })}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={showPutts}
              onChange={(event) => setShowPutts(event.target.checked)}
              className="h-4 w-4 border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
            />
            Visa puttar
          </label>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            type="submit"
            className="w-full rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            {t("quickRound.start.startButton")}
          </button>
        </form>
      </section>
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="text-xl font-semibold text-slate-100">Tidigare rundor</h2>
        {rounds.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Du har inga sparade snabbrundor ännu.</p>
        ) : (
          <ul className="mt-4 space-y-3">
              {rounds.map((round) => (
                <li key={round.id} className="rounded border border-slate-800 bg-slate-950/40 p-4">
                  <Link to={`/play/${round.id}`} className="flex flex-col gap-1 text-sm text-slate-200">
                    <span className="text-base font-semibold text-slate-100">
                      {round.courseName ?? t("profile.quickRounds.unknownCourse")}
                    </span>
                    <span className="text-xs text-slate-400">
                      Startad {dateFormatter.format(new Date(round.startedAt))}
                    </span>
                  <span className="text-xs font-semibold text-emerald-300">
                    {round.completedAt ? "Klar" : "Pågår"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HeroTeeSelector({
  course,
  selectedTeeId,
  onSelectTee,
}: {
  course?: HeroCourseSummary;
  selectedTeeId?: string;
  onSelectTee: (tee: HeroCourseTee) => void;
}) {
  const { t } = useTranslation();

  if (!course || course.tees.length === 0) {
    return null;
  }

  const selected = course.tees.find((tee) => tee.id === selectedTeeId) ?? course.tees[0];

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-200" htmlFor="heroTee">
        {t("quickRound.start.heroTeeLabel")}
      </label>
      <select
        id="heroTee"
        value={selected?.id ?? ""}
        onChange={(event) => {
          const tee = course.tees.find((candidate) => candidate.id === event.target.value);
          if (tee) {
            onSelectTee(tee);
          }
        }}
        className="w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
      >
        {course.tees.map((tee) => {
          const length = course.lengthsByTee?.[tee.id];
          const labelParts = [tee.label];
          if (typeof length === "number") {
            labelParts.push(`${length} m`);
          }
          return (
            <option key={tee.id} value={tee.id}>
              {labelParts.join(" • ")}
            </option>
          );
        })}
      </select>
    </div>
  );
}

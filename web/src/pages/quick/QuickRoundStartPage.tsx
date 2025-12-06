import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import {
  fetchCourses,
  fetchCourseLayout,
  fetchHeroCourses,
  type CourseSummary,
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
import { DEMO_COURSE_NAME } from "@/features/quickround/constants";
import { DEMO_LINKS_HERO_LAYOUT } from "@/features/quickround/courseLayouts";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAutoHoleSuggest } from "@/hooks/useAutoHoleSuggest";
import type { CourseLayout } from "@/types/course";

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
  const [courseName, setCourseName] = useState("");
  const [courseNameTouched, setCourseNameTouched] = useState(false);
  const [teesName, setTeesName] = useState("");
  const [holesCount, setHolesCount] = useState<9 | 18>(18);
  const [showPutts, setShowPutts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<QuickRoundSummary[]>([]);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [heroCourses, setHeroCourses] = useState<HeroCourseSummary[]>([]);
  const [selectedHeroCourseId, setSelectedHeroCourseId] =
    useState<string>();
  const [selectedHeroTeeId, setSelectedHeroTeeId] = useState<string>();
  const [selectedCourseId, setSelectedCourseId] = useState<string | undefined>();
  const [courseLayout, setCourseLayout] = useState<CourseLayout | null>(null);
  const [courseLayoutLoading, setCourseLayoutLoading] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [handicapInput, setHandicapInput] = useState<string>(() => {
    const stored = loadDefaultHandicap();
    return stored != null ? String(stored) : "";
  });
  const [startingHole, setStartingHole] = useState<number>(1);
  const [startHoleManuallySet, setStartHoleManuallySet] = useState(false);

  const selectedHeroCourse = useMemo(
    () => heroCourses.find((course) => course.id === selectedHeroCourseId),
    [heroCourses, selectedHeroCourseId]
  );
  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId),
    [courses, selectedCourseId]
  );

  const holeNumbers = useMemo(() => {
    if (selectedHeroCourse?.holeDetails?.length) {
      return selectedHeroCourse.holeDetails
        .map((hole, index) => hole.number ?? index + 1)
        .sort((a, b) => a - b);
    }
    if (courseLayout?.holes?.length) {
      return courseLayout.holes
        .map((hole) => hole.number)
        .sort((a, b) => a - b);
    }
    const total =
      selectedHeroCourse?.holes ?? selectedCourse?.holeCount ?? holesCount;
    return Array.from({ length: total }, (_, index) => index + 1);
  }, [courseLayout?.holes, holesCount, selectedCourse?.holeCount, selectedHeroCourse]);

  const geoState = useGeolocation(true);
  const autoHoleSuggestion = useAutoHoleSuggest(courseLayout, geoState);

  const persistHandicapDefault = (value: string) => {
    const trimmed = value.trim();

    if (!trimmed) {
      clearDefaultHandicap();
      return;
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      saveDefaultHandicap(parsed);
    }
  };

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

    const demoCourse: CourseSummary = {
      id: "demo-links-hero",
      name: DEMO_COURSE_NAME,
      holeCount: DEMO_LINKS_HERO_LAYOUT.holes.length,
      city: null,
      country: null,
    };

    async function loadCourses() {
      setCoursesLoading(true);
      try {
        const list = await fetchCourses();
        if (cancelled) return;
        if (list.length === 0) {
          setCourses([demoCourse]);
          setCourseLayout(DEMO_LINKS_HERO_LAYOUT);
          setSelectedCourseId(demoCourse.id);
          if (!courseNameTouched) {
            setCourseName(demoCourse.name);
          }
          return;
        }
        setCourses(list);
        const defaultCourse = list[0];
        setSelectedCourseId((current) => current ?? defaultCourse.id);
        if (!courseNameTouched) {
          setCourseName((current) => current || defaultCourse.name);
        }
      } catch (error) {
        if (!cancelled) {
          setCourses([demoCourse]);
          setCourseLayout(DEMO_LINKS_HERO_LAYOUT);
          setSelectedCourseId(demoCourse.id);
          if (!courseNameTouched) {
            setCourseName(demoCourse.name);
          }
        }
      } finally {
        if (!cancelled) {
          setCoursesLoading(false);
        }
      }
    }

    loadCourses();

    return () => {
      cancelled = true;
    };
  }, [courseNameTouched]);

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
    if (!selectedCourseId) {
      setCourseLayout(null);
      return;
    }

    let cancelled = false;
    setCourseLayoutLoading(true);

    fetchCourseLayout(selectedCourseId)
      .then((layout) => {
        if (cancelled) return;
        setCourseLayout(layout);
        if (!courseNameTouched) {
          setCourseName((current) => current || layout.name);
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (selectedCourseId === "demo-links-hero") {
          setCourseLayout(DEMO_LINKS_HERO_LAYOUT);
          if (!courseNameTouched) {
            setCourseName(DEMO_COURSE_NAME);
          }
          return;
        }
        setCourseLayout(null);
      })
      .finally(() => {
        if (!cancelled) {
          setCourseLayoutLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [courseNameTouched, selectedCourseId]);

  useEffect(() => {
    const selected = courses.find((course) => course.id === selectedCourseId);
    if (selected) {
      setCourseName(selected.name);
      if (selected.holeCount === 9 || selected.holeCount === 18) {
        setHolesCount(selected.holeCount as 9 | 18);
      }
    }
  }, [selectedCourseId, courses]);

  useEffect(() => {
    if (!selectedHeroCourse) {
      return;
    }

    setSelectedCourseId(selectedHeroCourse.id);
    setCourseName(selectedHeroCourse.name);

    if (selectedHeroCourse.tees.length > 0) {
      const preferredTee =
        selectedHeroCourse.tees.find((tee) => tee.id === selectedHeroTeeId) ||
        selectedHeroCourse.tees[0];
      if (preferredTee) {
        setSelectedHeroTeeId(preferredTee.id);
        if (teesName.trim().length === 0) {
          setTeesName(preferredTee.label);
        }
      }
    }
  }, [selectedHeroCourse, selectedHeroTeeId, teesName]);

  useEffect(() => {
    if (holeNumbers.length === 0) {
      return;
    }
    const minHole = holeNumbers[0];
    const maxHole = holeNumbers[holeNumbers.length - 1];
    setStartingHole((current) => {
      if (current < minHole || current > maxHole) {
        return minHole;
      }
      return current;
    });
  }, [holeNumbers]);

  useEffect(() => {
    if (startHoleManuallySet) {
      return;
    }
    if (!autoHoleSuggestion.suggestedHole) {
      return;
    }
    if (!holeNumbers.includes(autoHoleSuggestion.suggestedHole)) {
      return;
    }
    setStartingHole(autoHoleSuggestion.suggestedHole);
  }, [autoHoleSuggestion.suggestedHole, holeNumbers, startHoleManuallySet]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedCourse = courses.find((course) => course.id === selectedCourseId);
    const trimmedCourseName = courseName.trim();
    const finalCourseName =
      trimmedCourseName || courseLayout?.name || selectedCourse?.name || "";
    const finalCourseId = selectedCourse?.id ?? selectedCourseId;
    if (!finalCourseName) {
      setError(t("quickRound.start.courseNameRequired"));
      return;
    }
    const trimmedTeesName = teesName.trim();
    const heroHoleMetadata = selectedHeroCourse?.holeDetails;
    let holes: QuickRound["holes"];
    if (heroHoleMetadata && heroHoleMetadata.length > 0) {
      holes = heroHoleMetadata.map((hole, index) => ({
        index: hole.number ?? index + 1,
        par: hole.par ?? 4,
      }));
    } else if (courseLayout?.holes?.length) {
      holes = courseLayout.holes
        .slice()
        .sort((a, b) => a.number - b.number)
        .map((hole) => ({
          index: hole.number,
          par: 4,
        }));
    } else if (selectedHeroCourse?.holes) {
      holes = Array.from({ length: selectedHeroCourse.holes }, (_, index) => ({
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
      }
    }
    const roundId = createRoundId();
    const round: QuickRound = {
      id: roundId,
      runId: roundId,
      courseName: finalCourseName,
      courseId: finalCourseId,
      teesName: trimmedTeesName || undefined,
      holes,
      startHole: startingHole,
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
                setCourseNameTouched(true);
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
                setStartHoleManuallySet(false);
                if (error && (value || courseName.trim().length > 0)) {
                  setError(null);
                }
              }}
              className="w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              <option value="" disabled={coursesLoading}>
                {coursesLoading ? t("common.loading") : t("quickround.course.none")}
              </option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name} ({course.holeCount})
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
                        setStartHoleManuallySet(false);
                        setStartingHole(1);
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
              onChange={(event) => {
                const nextValue = event.target.value;
                setHandicapInput(nextValue);
                persistHandicapDefault(nextValue);
              }}
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-200" htmlFor="startHole">
                Start hole
              </label>
              {courseLayoutLoading ? (
                <span className="text-xs text-slate-400">Loading layout…</span>
              ) : null}
              {autoHoleSuggestion.suggestedHole ? (
                <span className="text-xs font-semibold text-emerald-300" data-testid="auto-hole-suggestion">
                  Suggested hole: {autoHoleSuggestion.suggestedHole}
                  {autoHoleSuggestion.distanceToSuggestedM != null && (
                    <>
                      {" "}(≈ {Math.round(autoHoleSuggestion.distanceToSuggestedM)} m away)
                    </>
                  )}
                </span>
              ) : null}
            </div>
            <select
              id="startHole"
              value={startingHole}
              onChange={(event) => {
                setStartingHole(Number(event.target.value));
                setStartHoleManuallySet(true);
              }}
              className="w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              {holeNumbers.map((hole) => (
                <option key={hole} value={hole}>
                  {t("quickRound.start.holesOption", { count: hole })}
                </option>
              ))}
            </select>
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

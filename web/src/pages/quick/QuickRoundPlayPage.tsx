import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { useNotifications } from "@/notifications/NotificationContext";
import { useUserSession } from "@/user/UserSessionContext";
import { postQuickRoundSnapshots } from "@/user/historyApi";
import { mapQuickRoundToSnapshot } from "@/user/historySync";
import { fetchSgPreview, type RoundSgPreview } from "@/api/sgPreview";
import { UpgradeGate } from "@/access/UpgradeGate";
import { QuickRoundCoachSection } from "./QuickRoundCoachSection";
import { SgPreviewCard } from "./SgPreviewCard";
import { ShareWithCoachButton } from "@/coach/ShareWithCoachButton";
import { fetchBagStats } from "@/api/bagStatsClient";
import { mapBagStateToPlayerBag } from "@/bag/utils";
import { loadBag } from "@/bag/storage";
import type { BagState } from "@/bag/types";
import { useUnits } from "@/preferences/UnitsContext";
import { formatBagSuggestion } from "@/bag/formatBagSuggestion";

import { buildStrokesGainedLightTrend } from "@shared/stats/strokesGainedLight";
import { mapSgLightCategoryToFocusArea } from "@/sg/sgLightWebUtils";
import { RoundStoryInsights } from "./RoundStoryInsights";

import {
  loadRound,
  saveRound,
} from "../../features/quickround/storage";
import { QuickHole, QuickRound } from "../../features/quickround/types";
import { useCourseBundle } from "../../courses/hooks";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useAutoHoleSuggest } from "@/hooks/useAutoHoleSuggest";
import { resolveCourseLayout } from "@/features/quickround/courseLayouts";
import { computeQuickRoundSummary } from "../../features/quickround/summary";
import { syncQuickRoundToWatch } from "../../features/watch/api";
import { computeHoleCaddieTargets } from "@shared/round/autoHoleCore";
import type { BagClubStatsMap } from "@shared/caddie/bagStats";
import { buildBagReadinessOverview, buildBagReadinessRecapInfo } from "@shared/caddie/bagReadiness";
import { loadPracticeMissionHistory } from "@/practice/practiceMissionHistory";
import type { PracticeMissionHistoryEntry } from "@shared/practice/practiceHistory";
import {
  getTopPracticeRecommendationForRecap,
  type BagPracticeRecommendation,
} from "@shared/caddie/bagPracticeRecommendations";
import type { PracticeRecommendationContext } from "@shared/practice/practiceRecommendationsAnalytics";
import type { StrokesGainedLightCategory } from "@shared/stats/strokesGainedLight";

export default function QuickRoundPlayPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const { session: userSession } = useUserSession();
  const { unit } = useUnits();
  const userId = userSession?.userId ?? null;
  const [round, setRound] = useState<QuickRound | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showPutts, setShowPutts] = useState(true);
  const [autoHoleEnabled, setAutoHoleEnabled] = useState(false);
  const [currentHoleNumber, setCurrentHoleNumber] = useState<number>(1);
  const [suppressedSuggestion, setSuppressedSuggestion] = useState<
    { hole: number; expires: number } | null
  >(null);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [watchStatus, setWatchStatus] = useState<
    { deviceId: string | null; synced: boolean } | null
  >(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [watchSyncing, setWatchSyncing] = useState(false);
  const [sgPreview, setSgPreview] = useState<RoundSgPreview | null>(null);
  const [sgStatus, setSgStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const summaryCopyTimeout = useRef<number | null>(null);
  const [bag] = useState<BagState>(() => loadBag());
  const [bagStats, setBagStats] = useState<BagClubStatsMap | null>(null);
  const [practiceHistory, setPracticeHistory] = useState<PracticeMissionHistoryEntry[]>([]);
  const [practiceRecommendation, setPracticeRecommendation] = useState<BagPracticeRecommendation | null>(null);
  const geoState = useGeolocation(autoHoleEnabled);
  const { position, error: geoError } = geoState;
  const { data: bundle, loading: bundleLoading, error: bundleError } = useCourseBundle(
    round?.courseId
  );
  const courseLayout = useMemo(
    () => resolveCourseLayout(round?.courseId, round?.courseName, bundle ?? null),
    [bundle, round?.courseId, round?.courseName]
  );
  const currentHoleLayout = useMemo(() => {
    if (!courseLayout) return null;
    return courseLayout.holes.find((hole) => hole.number === currentHoleNumber) ?? null;
  }, [courseLayout, currentHoleNumber]);
  const caddieTargets = useMemo(() => {
    if (!courseLayout || !currentHoleLayout) return null;
    return computeHoleCaddieTargets(courseLayout, currentHoleLayout);
  }, [courseLayout, currentHoleLayout]);
  const autoHoleSuggestion = useAutoHoleSuggest(
    autoHoleEnabled ? courseLayout : null,
    geoState
  );
  const suggestion =
    autoHoleSuggestion.suggestedHole != null ? autoHoleSuggestion : null;

  useEffect(() => {
    if (!roundId) {
      setNotFound(true);
      return;
    }
    const existing = loadRound(roundId);
    if (!existing) {
      setNotFound(true);
      return;
    }
    setRound(existing);
    setShowPutts(existing.showPutts ?? true);
    setCurrentHoleNumber(determineCurrentHoleNumber(existing.holes, existing.startHole));
    setAutoHoleEnabled(Boolean(existing.courseId));
    setSuppressedSuggestion(null);
  }, [roundId]);

  useEffect(() => {
    let cancelled = false;
    fetchBagStats()
      .then((stats) => {
        if (!cancelled) {
          setBagStats(stats);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBagStats(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadPracticeMissionHistory()
      .then((history) => {
        if (!cancelled) {
          setPracticeHistory(history ?? []);
        }
      })
      .catch((err) => {
        console.warn("[quickround] Failed to load practice history", err);
        if (!cancelled) {
          setPracticeHistory([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!courseLayout && autoHoleEnabled && !bundleLoading) {
      setAutoHoleEnabled(false);
    }
  }, [autoHoleEnabled, bundleLoading, courseLayout]);

  useEffect(() => {
    if (suppressedSuggestion && suppressedSuggestion.expires <= Date.now()) {
      setSuppressedSuggestion(null);
    }
  }, [suppressedSuggestion]);

  useEffect(() => {
    if (!round?.completedAt) {
      setSgPreview(null);
      setSgStatus("idle");
      return;
    }
    if (!round.runId) {
      setSgStatus("error");
      setSgPreview(null);
      return;
    }

    setSgStatus("loading");
    fetchSgPreview(round.runId)
      .then((data) => {
        setSgPreview(data);
        setSgStatus("loaded");
      })
      .catch(() => {
        setSgStatus("error");
      });
  }, [round?.completedAt, round?.runId]);

  useEffect(() => {
    if (!autoHoleEnabled && suppressedSuggestion) {
      setSuppressedSuggestion(null);
    }
  }, [autoHoleEnabled, suppressedSuggestion]);

  useEffect(() => {
    return () => {
      if (summaryCopyTimeout.current !== null) {
        window.clearTimeout(summaryCopyTimeout.current);
      }
    };
  }, []);

  const summary = useMemo(() => {
    if (!round) {
      return null;
    }
    return computeQuickRoundSummary(round);
  }, [round]);

  const sgLightSummary = round?.strokesGainedLight ?? null;
  const sgLightTrend = useMemo(() => {
    if (round?.strokesGainedLightTrend) return round.strokesGainedLightTrend;
    if (round?.strokesGainedLightRounds?.length)
      return buildStrokesGainedLightTrend(round.strokesGainedLightRounds, { windowSize: 5 });
    return null;
  }, [round?.strokesGainedLightRounds, round?.strokesGainedLightTrend]);

  const buildSgLightPracticeHref = useCallback(
    (focusCategory: StrokesGainedLightCategory, surface: "web_round_recap" | "web_round_story") => {
      const recommendation: PracticeRecommendationContext = {
        source: "practice_recommendations",
        focusArea: mapSgLightCategoryToFocusArea(focusCategory),
        reasonKey: "sg_light_focus",
        origin: surface,
        strokesGainedLightFocusCategory: focusCategory,
        surface,
      };

      const params = new URLSearchParams();
      params.set("source", surface);
      params.set("recommendation", JSON.stringify(recommendation));
      return `/range/practice?${params.toString()}`;
    },
    [],
  );

  const sgLightStoryHrefBuilder = useCallback(
    (focusCategory: StrokesGainedLightCategory) => buildSgLightPracticeHref(focusCategory, "web_round_story"),
    [buildSgLightPracticeHref],
  );

  const playerBag = useMemo(() => mapBagStateToPlayerBag(bag), [bag]);

  const bagReadinessOverview = useMemo(() => {
    if (!bagStats || bag.clubs.length === 0) return null;
    try {
      return buildBagReadinessOverview(playerBag, bagStats);
    } catch (err) {
      console.warn("[quickround] Failed to compute bag readiness", err);
      return null;
    }
  }, [bag.clubs.length, bagStats, playerBag]);

  const bagReadinessRecap = useMemo(
    () => (bag.clubs.length ? buildBagReadinessRecapInfo(playerBag, bagStats) : null),
    [bag.clubs.length, bagStats, playerBag],
  );

  const clubLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    bag.clubs.forEach((club) => {
      labels[club.id] = club.label;
    });
    return labels;
  }, [bag.clubs]);

  const bagReadinessSummary = useMemo(() => {
    if (!bagReadinessRecap) return null;
    return t(`bag.readinessRecap.summary.${bagReadinessRecap.summary}`);
  }, [bagReadinessRecap, t]);

  const bagReadinessSuggestion = useMemo(() => {
    if (!bagReadinessRecap?.topSuggestionId || !bagReadinessOverview?.suggestions?.length) return null;
    const suggestion =
      bagReadinessOverview.suggestions.find((item) => item.id === bagReadinessRecap.topSuggestionId) ??
      bagReadinessOverview.suggestions[0];
    return suggestion ? formatBagSuggestion(suggestion, clubLabels, unit, t) : null;
  }, [bagReadinessOverview?.suggestions, bagReadinessRecap?.topSuggestionId, clubLabels, unit, t]);

  const practiceRecommendationCopy = useMemo(() => {
    if (!practiceRecommendation) return null;

    const [lowerId, upperId] = practiceRecommendation.targetClubs;
    const lower = lowerId ? clubLabels[lowerId] ?? lowerId : undefined;
    const upper = upperId ? clubLabels[upperId] ?? upperId : undefined;
    const club = lower;

    return {
      title: t(practiceRecommendation.titleKey, { lower, upper, club }),
      description: t(practiceRecommendation.descriptionKey, { lower, upper, club }),
    };
  }, [clubLabels, practiceRecommendation, t]);

  const practiceRecommendationStatus = useMemo(() => {
    if (!practiceRecommendation) return null;
    if (practiceRecommendation.status === "new") return t("bag.practice.status.new");
    if (practiceRecommendation.status === "due") return t("bag.practice.status.due");
    return t("bag.practice.status.fresh");
  }, [practiceRecommendation, t]);

  const practiceRecommendationLink = useMemo(() => {
    if (!practiceRecommendation) return "/range/practice";
    const [firstClub] = practiceRecommendation.targetClubs ?? [];
    const params = new URLSearchParams();
    params.set("entrySource", "recap");
    if (firstClub) {
      params.set("club", firstClub);
    }

    const query = params.toString();
    return `/range/practice${query ? `?${query}` : ""}`;
  }, [practiceRecommendation]);

  useEffect(() => {
    if (!bagReadinessOverview) {
      setPracticeRecommendation(null);
      return;
    }

    try {
      const rec = getTopPracticeRecommendationForRecap({
        overview: bagReadinessOverview,
        history: practiceHistory,
        suggestions: bagReadinessOverview.suggestions,
      });
      setPracticeRecommendation(rec);
    } catch (err) {
      console.warn("[quickround] Failed to build recap practice recommendation", err);
      setPracticeRecommendation(null);
    }
  }, [bagReadinessOverview, practiceHistory]);

  const memberId = useMemo(
    () => round?.memberId ?? readStoredMemberId(),
    [round?.memberId]
  );
  const runId = round?.runId ?? round?.id;
  const syncWatch = useCallback(
    async (holeNumber: number) => {
      if (!runId || !memberId) {
        setWatchStatus((current) => current ?? { deviceId: null, synced: false });
        return;
      }

      setWatchSyncing(true);
      try {
        const result = await syncQuickRoundToWatch({
          memberId,
          runId,
          courseId: round?.courseId ?? null,
          hole: holeNumber,
        });
        setWatchStatus(result);
        setWatchError(null);
      } catch (error) {
        setWatchError(t("quickRound.watch.error"));
        notify("error", t("quickRound.watch.error"));
      } finally {
        setWatchSyncing(false);
      }
    },
    [memberId, notify, round?.courseId, runId, t]
  );

  useEffect(() => {
    if (!round) {
      return;
    }
    void syncWatch(currentHoleNumber);
  }, [round?.id, currentHoleNumber, syncWatch]);

  if (notFound) {
    return (
      <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/50 p-6 text-slate-100">
        <h1 className="text-xl font-semibold">Round not found</h1>
        <Link to="/play" className="text-sm font-semibold text-emerald-300 hover:underline">
          Back to start
        </Link>
      </div>
    );
  }

  if (!round) {
    return null;
  }

  const headerDate = new Date(round.startedAt).toLocaleString("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const courseTitle = round.courseName ?? t("profile.quickRounds.unknownCourse");

  const autoHoleAvailable = Boolean(courseLayout);
  const hasSuppressedActiveSuggestion =
    suggestion &&
    suppressedSuggestion &&
    suppressedSuggestion.hole === suggestion.suggestedHole &&
    suppressedSuggestion.expires > Date.now();
  const shouldShowSuggestion =
    autoHoleEnabled &&
    suggestion &&
    suggestion.suggestedHole !== currentHoleNumber &&
    !hasSuppressedActiveSuggestion;

  const handleCopySummary = async () => {
    if (!round || !summary) {
      return;
    }

    const summaryLines = [
      `GolfIQ Quick Round – ${courseTitle}`,
      "",
      `Date: ${new Date(round.startedAt).toLocaleString()}`,
      `Score: ${summary.totalStrokes} (${formatToPar(summary.toPar)})`,
      `Holes: ${round.holes.length}`,
    ];

    if (summary.netStrokes !== null) {
      summaryLines.splice(4, 0, `Net: ${summary.netStrokes.toFixed(1)} (${formatToPar(summary.netToPar)})`);
    }

    const summaryText = summaryLines.join("\n");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summaryText);

        setSummaryCopied(true);
        if (summaryCopyTimeout.current !== null) {
          window.clearTimeout(summaryCopyTimeout.current);
        }
        summaryCopyTimeout.current = window.setTimeout(() => {
          setSummaryCopied(false);
          summaryCopyTimeout.current = null;
        }, 4000);

        notify("success", t("quickRound.share.copied"));
      } else {
        window.prompt(t("quickRound.share.button"), summaryText);
        notify("error", t("quickRound.share.error"));
      }
    } catch (error) {
      console.warn("Failed to copy quick round summary", error);
      setSummaryCopied(false);
      notify("error", t("quickRound.share.error"));
    }
  };

  const handleSelectHole = (index: number) => {
    setCurrentHoleNumber(index);
    setSuppressedSuggestion(null);
  };

  const handleAutoHoleToggle = (value: boolean) => {
    if (!autoHoleAvailable) {
      setAutoHoleEnabled(false);
      return;
    }
    setAutoHoleEnabled(value);
    if (!value) {
      setSuppressedSuggestion(null);
    }
  };

  const handleAcceptSuggestion = () => {
    if (!suggestion || suggestion.suggestedHole == null) {
      return;
    }
    setCurrentHoleNumber(suggestion.suggestedHole);
    setSuppressedSuggestion(null);
  };

  const handleIgnoreSuggestion = () => {
    const ignoredHole = suggestion?.suggestedHole;
    if (ignoredHole) {
      setSuppressedSuggestion({
        hole: ignoredHole,
        expires: Date.now() + 30_000,
      });
    }
  };

  const handleHoleChange = (next: QuickHole) => {
    setRound((current) => {
      if (!current) {
        return current;
      }
      const updated: QuickRound = {
        ...current,
        holes: current.holes.map((hole) => (hole.index === next.index ? next : hole)),
        showPutts,
      };
      saveRound(updated);
      return updated;
    });
  };

  const handleShowPuttsToggle = (value: boolean) => {
    setShowPutts(value);
    setRound((current) => {
      if (!current) {
        return current;
      }
      const updated: QuickRound = {
        ...current,
        showPutts: value,
      };
      saveRound(updated);
      return updated;
    });
  };

  const markCompleted = () => {
    setRound((current) => {
      if (!current) {
        return current;
      }
      if (current.completedAt) {
        return current;
      }
      const updated: QuickRound = {
        ...current,
        completedAt: new Date().toISOString(),
        showPutts,
      };
      saveRound(updated);
      if (userId && updated.completedAt) {
        const snapshot = mapQuickRoundToSnapshot(updated);
        void Promise.resolve(postQuickRoundSnapshots([snapshot])).catch(() => {
          // ignore for local-first
        });
      }
      return updated;
    });
  };

  return (
    <>
      <div className="space-y-8 text-slate-100">
        <header className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
          <section
            className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs"
            data-testid="quickround-watch-status"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              <span className="font-medium text-slate-700">
                {t("quickRound.watch.label")}
              </span>
              {watchStatus?.deviceId ? (
                <span className="text-emerald-700">
                  {watchStatus.synced
                    ? t("quickRound.watch.synced")
                    : t("quickRound.watch.paired")}
                </span>
              ) : (
                <span className="text-slate-500">{t("quickRound.watch.noWatch")}</span>
              )}
              {watchSyncing && <span className="text-slate-400">…</span>}
            </div>
            {watchError ? <span className="text-rose-400">{watchError}</span> : null}
          </section>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-100">{courseTitle}</h1>
              <p className="text-sm text-slate-400">
                {round.teesName ? `${round.teesName} • ` : ""}Startad {headerDate}
              </p>
              {round.courseId && (
                <p className="mt-1 text-xs text-slate-400">
                  {bundleLoading && "Laddar kursinfo…"}
                  {!bundleLoading && bundle &&
                    `Course bundle: ${bundle.name} (${bundle.country}), ${bundle.holes.length} hål`}
                  {!bundleLoading && bundleError && !bundle && "Kunde inte ladda kursinfo."}
                </p>
              )}
              <p className="mt-2 text-xs text-emerald-300">Aktivt hål: {currentHoleNumber}</p>
              {currentHoleLayout && (
                <p className="text-xs text-slate-300">
                  Par {currentHoleLayout.par}
                  {currentHoleLayout.yardage_m
                    ? ` · ${currentHoleLayout.yardage_m} m`
                    : ""}
                </p>
              )}
            </div>
            <div className="flex w-full flex-col items-end gap-2 text-sm text-slate-200 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={showPutts}
                  onChange={(event) => handleShowPuttsToggle(event.target.checked)}
                  className="h-4 w-4 border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                Visa puttar
              </label>
              <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center">
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={autoHoleEnabled}
                    disabled={!autoHoleAvailable}
                    onChange={(event) => handleAutoHoleToggle(event.target.checked)}
                    className="h-4 w-4 border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-600"
                  />
                  {t("quickround.autoHole.label")}
                </label>
                {!autoHoleAvailable && (
                  <span className="text-xs text-slate-500 sm:ml-2">Kräver kursbundle</span>
                )}
              </div>
              {round.completedAt && (
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                  Klar runda
                </span>
              )}
            </div>
          </div>
        {autoHoleEnabled && geoError && (
          <p className="mt-2 text-xs text-amber-300 sm:text-right">
            Kunde inte hämta GPS: {geoError.message}
          </p>
        )}
      </header>
      {caddieTargets && (
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-200">
          <h3 className="text-base font-semibold text-slate-100">Caddie Targets</h3>
          <p className="mt-2">Green: Center of green</p>
          {caddieTargets.layup && (
            <p className="mt-1">
              Layup: {caddieTargets.layup.carryDistanceM} m from tee (safe fairway layup)
            </p>
          )}
        </section>
      )}
      {shouldShowSuggestion && suggestion && (
        <div className="rounded-lg border border-emerald-500/50 bg-slate-900/70 p-3 text-xs text-slate-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {t("quickround.autoHole.suggestedHole", { hole: suggestion.suggestedHole })}
              </p>
              <p className="text-[10px] text-slate-400">
                {t("quickround.autoHole.distance", {
                  distance: Math.round(suggestion.distanceToSuggestedM ?? 0),
                })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleIgnoreSuggestion}
                className="text-[10px] font-semibold text-slate-300 underline hover:text-slate-100"
              >
                {t("quickround.autoHole.ignore")}
              </button>
              <button
                type="button"
                onClick={handleAcceptSuggestion}
                className="rounded bg-emerald-500 px-3 py-1 text-[10px] font-semibold text-slate-900 transition hover:bg-emerald-400"
              >
                {t("quickround.autoHole.accept")}
              </button>
            </div>
          </div>
        </div>
      )}
      <section className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/60">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Hål</th>
              <th className="px-4 py-3">{t("quickRound.play.par")}</th>
              <th className="px-4 py-3">{t("quickRound.play.strokes")}</th>
              {showPutts && <th className="px-4 py-3">Puttar</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {round.holes.map((hole) => (
              <QuickHoleRow
                key={hole.index}
                hole={hole}
                onChange={handleHoleChange}
                showPutts={showPutts}
                isActive={hole.index === currentHoleNumber}
                onSelect={handleSelectHole}
              />
            ))}
          </tbody>
        </table>
      </section>
      {summary && (
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-200">
          <h2 className="text-lg font-semibold text-slate-100">
            {t("quickRound.play.summaryTitle")}
          </h2>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <SummaryItem
                label={t("quickRound.play.strokes")}
                value={summary.totalStrokes.toString()}
              />
              <SummaryItem
                label={t("quickRound.play.par")}
                value={summary.totalPar.toString()}
              />
              <SummaryItem
                label={t("quickRound.play.toPar")}
                value={formatToPar(summary.toPar)}
              />
              {summary.netStrokes !== null && (
                <SummaryItem
                  label={t("quickRound.summary.netStrokes")}
                  value={summary.netStrokes.toFixed(1)}
                />
              )}
              {summary.netToPar !== null && (
                <SummaryItem
                  label={t("quickRound.summary.netResult")}
                  value={formatToPar(summary.netToPar)}
                />
              )}
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <button
                type="button"
                onClick={handleCopySummary}
                className="inline-flex items-center rounded-md border border-emerald-500/60 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10"
              >
                {t("quickRound.share.button")}
              </button>
              {round.runId ? (
                <ShareWithCoachButton
                  runId={round.runId}
                  className="w-full justify-center sm:w-auto"
                />
              ) : null}
              {summaryCopied ? (
                <p className="text-xs text-emerald-300 sm:text-right">
                  {t("quickRound.share.copied")}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      )}
      {sgLightSummary || sgLightTrend ? (
        <RoundStoryInsights
          summary={sgLightSummary}
          trend={sgLightTrend}
          rounds={round?.strokesGainedLightRounds ?? null}
          practiceHrefBuilder={sgLightStoryHrefBuilder}
          roundId={round?.runId}
        />
      ) : null}
      {bagReadinessRecap ? (
        // TODO: send telemetry for recap bag readiness impressions
        <section
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-200"
          data-testid="round-recap-bag-readiness"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-100">{t("bag.readinessTitle")}</h3>
              {bagReadinessSummary ? (
                <p className="text-sm text-slate-300">{bagReadinessSummary}</p>
              ) : null}
            </div>
            <Link
              to="/bag"
              className="rounded-md border border-emerald-400/60 px-3 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/10"
              data-testid="round-recap-open-bag"
              // TODO: track recap-to-bag navigation
            >
              {t("bag.readinessRecap.tuneCta")}
            </Link>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-2xl font-semibold text-slate-50">{bagReadinessRecap.score}/100</div>
              <div className="text-xs uppercase tracking-wide text-slate-400">
                {t(`bag.readinessGrade.${bagReadinessRecap.grade}`)}
              </div>
            </div>
            {bagReadinessSuggestion ? (
              <p className="max-w-xl text-sm text-slate-200" data-testid="round-recap-bag-suggestion">
                {t("bag.readinessTileSuggestionPrefix")} {bagReadinessSuggestion}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
      {practiceRecommendation && practiceRecommendationCopy ? (
        <section
          className="rounded-lg border border-emerald-800 bg-emerald-950/60 p-6 text-sm text-emerald-50"
          data-testid="round-recap-practice-recommendation"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-emerald-50">
                {t("round.recap.nextPracticeTitle")}
              </h3>
              <p className="text-xs text-emerald-100/80">{t("round.recap.nextPracticeHelper")}</p>
            </div>
            <Link
              to={practiceRecommendationLink}
              className="rounded-md border border-emerald-400/70 px-3 py-1 text-xs font-semibold text-emerald-50 hover:bg-emerald-500/10"
              data-testid="round-recap-practice-cta"
            >
              {t("round.recap.nextPracticeCta")}
            </Link>
          </div>
          <div className="mt-4 rounded-md border border-emerald-800/60 bg-emerald-900/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-emerald-50">{practiceRecommendationCopy.title}</p>
              {practiceRecommendationStatus ? (
                <span className="rounded-full border border-emerald-300/80 px-3 py-1 text-[11px] font-semibold text-emerald-50">
                  {practiceRecommendationStatus}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-emerald-100/90">{practiceRecommendationCopy.description}</p>
          </div>
        </section>
      ) : null}
      {round?.completedAt && (
        <UpgradeGate feature="SG_PREVIEW">
          <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-200">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  {t("quickround.sg.title")}
                </h2>
                <p className="text-xs text-slate-400">
                  {t("quickround.sg.subtitle")}
                </p>
              </div>
            </div>
            <SgPreviewCard status={sgStatus} preview={sgPreview} />
          </section>
        </UpgradeGate>
      )}
      {round?.completedAt && (
        <QuickRoundCoachSection runId={round.runId ?? null} />
      )}
      <div>
        <button
          type="button"
          onClick={markCompleted}
          disabled={Boolean(round.completedAt)}
          className="rounded bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
        >
          {round.completedAt ? "Runda avslutad" : "Avsluta runda"}
        </button>
      </div>
      </div>
    </>
  );
}

type QuickHoleRowProps = {
  hole: QuickHole;
  onChange(next: QuickHole): void;
  showPutts: boolean;
  isActive: boolean;
  onSelect(index: number): void;
};

function QuickHoleRow({ hole, onChange, showPutts, isActive, onSelect }: QuickHoleRowProps) {
  const handleParChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      onChange({ ...hole, par: parsed });
    }
  };

  const handleStrokesChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    onChange({ ...hole, strokes: Number.isNaN(parsed) ? undefined : parsed });
  };

  const handlePuttsChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    onChange({ ...hole, putts: Number.isNaN(parsed) ? undefined : parsed });
  };

  const rowClassName = `text-slate-200 ${isActive ? "bg-emerald-500/10 text-slate-100" : ""}`;

  return (
    <tr className={rowClassName}>
      <td className="px-4 py-3 text-sm font-medium">
        <button
          type="button"
          onClick={() => onSelect(hole.index)}
          aria-pressed={isActive}
          className={`rounded px-2 py-1 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
            isActive
              ? "bg-emerald-500/20 text-emerald-200"
              : "bg-transparent text-slate-200 hover:text-emerald-300"
          }`}
        >
          {hole.index}
        </button>
      </td>
      <td className="px-4 py-3">
        <select
          value={hole.par}
          onChange={(event) => handleParChange(event.target.value)}
          aria-label={`Par hål ${hole.index}`}
          className="w-20 rounded border border-slate-700 bg-slate-950/80 px-2 py-1 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        >
          {[3, 4, 5].map((par) => (
            <option key={par} value={par}>
              {par}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          min={1}
          value={hole.strokes ?? ""}
          onChange={(event) => handleStrokesChange(event.target.value)}
          aria-label={`Slag hål ${hole.index}`}
          className="w-24 rounded border border-slate-700 bg-slate-950/80 px-2 py-1 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        />
      </td>
      {showPutts && (
        <td className="px-4 py-3">
          <input
            type="number"
            min={0}
            value={hole.putts ?? ""}
            onChange={(event) => handlePuttsChange(event.target.value)}
            aria-label={`Puttar hål ${hole.index}`}
            className="w-24 rounded border border-slate-700 bg-slate-950/80 px-2 py-1 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
          />
        </td>
      )}
    </tr>
  );
}

type SummaryItemProps = {
  label: string;
  value: string;
};

function SummaryItem({ label, value }: SummaryItemProps) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/60 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}

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

function formatToPar(value: number | null): string {
  if (value === null) {
    return "—";
  }
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) < 0.05) {
    return "E";
  }
  const formatted = Number.isInteger(rounded)
    ? rounded.toFixed(0)
    : rounded.toFixed(1);
  return rounded > 0 ? `+${formatted}` : formatted;
}

function determineCurrentHoleNumber(holes: QuickHole[], preferredHole?: number): number {
  if (holes.length === 0) {
    return 1;
  }
  if (preferredHole && holes.some((hole) => hole.index === preferredHole)) {
    const preferred = holes.find(
      (hole) => hole.index === preferredHole && typeof hole.strokes !== "number"
    );
    if (preferred) {
      return preferred.index;
    }
  }
  const pending = holes.find((hole) => typeof hole.strokes !== "number");
  if (pending) {
    return pending.index;
  }
  return holes[holes.length - 1]?.index ?? 1;
}

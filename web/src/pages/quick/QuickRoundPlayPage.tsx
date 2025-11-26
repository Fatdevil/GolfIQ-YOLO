import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { useNotifications } from "@/notifications/NotificationContext";
import { useUserSession } from "@/user/UserSessionContext";
import { postQuickRoundSnapshots } from "@/user/historyApi";
import { mapQuickRoundToSnapshot } from "@/user/historySync";
import { fetchSgPreview, type RoundSgPreview, type SgCategory } from "@/api/sgPreview";

import {
  loadRound,
  saveRound,
} from "../../features/quickround/storage";
import { QuickHole, QuickRound } from "../../features/quickround/types";
import { useCourseBundle } from "../../courses/hooks";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useAutoHoleSuggest } from "@/features/quickround/useAutoHoleSuggest";
import { computeQuickRoundSummary } from "../../features/quickround/summary";
import { syncQuickRoundToWatch } from "../../features/watch/api";

const SG_CATEGORIES: SgCategory[] = ["TEE", "APPROACH", "SHORT", "PUTT"];

export default function QuickRoundPlayPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const { session: userSession } = useUserSession();
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
  const { position, error: geoError } = useGeolocation(autoHoleEnabled);
  const { data: bundle, loading: bundleLoading, error: bundleError } = useCourseBundle(
    round?.courseId
  );
  const autoHoleState = useAutoHoleSuggest({
    enabled: autoHoleEnabled && Boolean(round?.courseId),
    courseId: round?.courseId,
    lastHole: currentHoleNumber,
    lat: position?.lat,
    lon: position?.lon,
  });
  const suggestion = autoHoleState.status === "suggested" ? autoHoleState.suggestion : null;

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
    setCurrentHoleNumber(determineCurrentHoleNumber(existing.holes));
    setAutoHoleEnabled(Boolean(existing.courseId));
    setSuppressedSuggestion(null);
  }, [roundId]);

  useEffect(() => {
    if (!round?.courseId && autoHoleEnabled) {
      setAutoHoleEnabled(false);
    }
  }, [round?.courseId, autoHoleEnabled]);

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

  const memberId = useMemo(
    () => round?.memberId ?? readStoredMemberId(),
    [round?.memberId]
  );
  const runId = round?.runId ?? round?.id;
  const worstSgCategory = useMemo(
    () => (sgPreview ? biggestLeakCategory(sgPreview) : null),
    [sgPreview]
  );

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

  const autoHoleAvailable = Boolean(round.courseId);
  const hasSuppressedActiveSuggestion =
    suggestion &&
    suppressedSuggestion &&
    suppressedSuggestion.hole === suggestion.hole &&
    suppressedSuggestion.expires > Date.now();
  const shouldShowSuggestion =
    autoHoleEnabled &&
    suggestion &&
    suggestion.hole !== currentHoleNumber &&
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
    if (!suggestion) {
      return;
    }
    setCurrentHoleNumber(suggestion.hole);
    setSuppressedSuggestion(null);
  };

  const handleIgnoreSuggestion = () => {
    const ignoredHole = suggestion?.hole;
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
      {shouldShowSuggestion && suggestion && (
        <div className="rounded-lg border border-emerald-500/50 bg-slate-900/70 p-3 text-xs text-slate-100">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {t("quickround.autoHole.suggestedHole", { hole: suggestion.hole })}
              </p>
              <p className="text-[10px] text-slate-400">
                {t("quickround.autoHole.distance", {
                  distance: Math.round(suggestion.distance_m),
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
              {summaryCopied ? (
                <p className="text-xs text-emerald-300 sm:text-right">
                  {t("quickRound.share.copied")}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      )}
      {round?.completedAt && (
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
            {sgStatus === "loading" && (
              <span className="text-xs text-slate-400">Loading…</span>
            )}
          </div>
          {sgStatus === "error" && (
            <p className="mt-3 text-xs text-rose-300">{t("quickround.sg.error")}</p>
          )}
          {sgStatus === "loaded" && sgPreview && (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-semibold text-slate-100">
                {t("quickround.sg.total", { value: formatSgValue(sgPreview.total_sg) })}
              </p>
              <dl className="grid gap-2 sm:grid-cols-2">
                {SG_CATEGORIES.map((category) => {
                  const value = sgPreview.sg_by_cat?.[category] ?? 0;
                  const label = categoryLabel(category);
                  return (
                    <div
                      key={category}
                      className="flex items-center justify-between rounded border border-slate-800/60 bg-slate-950/40 px-3 py-2"
                    >
                      <dt className="text-xs uppercase tracking-wide text-slate-400">
                        {t("quickround.sg.category", { category: label, value: formatSgValue(value) })}
                      </dt>
                      <dd className="text-sm font-semibold text-slate-100">
                        {formatSgValue(value)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {worstSgCategory && (
                <p className="text-xs text-slate-400">
                  {t("quickround.sg.biggestLeak", {
                    category: categoryLabel(worstSgCategory),
                  })}
                </p>
              )}
            </div>
          )}
        </section>
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

function formatSgValue(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const formatted = rounded.toFixed(1);
  return rounded > 0 ? `+${formatted}` : formatted;
}

function categoryLabel(category: SgCategory): string {
  switch (category) {
    case "TEE":
      return "Tee";
    case "APPROACH":
      return "Approach";
    case "SHORT":
      return "Short game";
    case "PUTT":
      return "Putting";
    default:
      return category;
  }
}

function biggestLeakCategory(preview: RoundSgPreview): SgCategory | null {
  const entries = Object.entries(preview.sg_by_cat ?? {}) as [SgCategory, number][];
  if (entries.length === 0) {
    return null;
  }
  return entries.reduce<[SgCategory, number]>((worst, current) =>
    current[1] < worst[1] ? current : worst
  )[0];
}

function determineCurrentHoleNumber(holes: QuickHole[]): number {
  if (holes.length === 0) {
    return 1;
  }
  const pending = holes.find((hole) => typeof hole.strokes !== "number");
  if (pending) {
    return pending.index;
  }
  return holes[holes.length - 1]?.index ?? 1;
}

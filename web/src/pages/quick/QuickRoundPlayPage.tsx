import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { loadRound, saveRound } from "../../features/quickround/storage";
import { QuickHole, QuickRound } from "../../features/quickround/types";
import { useCourseBundle } from "../../courses/hooks";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useAutoHoleSuggestion } from "../../courses/useAutoHole";

export default function QuickRoundPlayPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const [round, setRound] = useState<QuickRound | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showPutts, setShowPutts] = useState(true);
  const [autoHoleEnabled, setAutoHoleEnabled] = useState(false);
  const [currentHoleNumber, setCurrentHoleNumber] = useState<number>(1);
  const [suppressedSuggestion, setSuppressedSuggestion] = useState<
    { hole: number; expires: number } | null
  >(null);
  const { position, error: geoError } = useGeolocation(autoHoleEnabled);
  const { data: bundle, loading: bundleLoading, error: bundleError } = useCourseBundle(
    round?.courseId
  );
  const { suggestion, clear: clearSuggestion } = useAutoHoleSuggestion({
    courseId: round?.courseId,
    currentHole: currentHoleNumber,
    position,
    enabled: autoHoleEnabled && Boolean(round?.courseId),
  });

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
    setAutoHoleEnabled(false);
    setSuppressedSuggestion(null);
  }, [roundId]);

  useEffect(() => {
    if (!round?.courseId && autoHoleEnabled) {
      setAutoHoleEnabled(false);
    }
  }, [round?.courseId, autoHoleEnabled]);

  useEffect(() => {
    if (!suggestion || !suppressedSuggestion) {
      return;
    }
    if (suppressedSuggestion.hole === suggestion.suggestedHole) {
      if (suppressedSuggestion.expires > Date.now()) {
        clearSuggestion();
      } else {
        setSuppressedSuggestion(null);
      }
    }
  }, [suggestion, suppressedSuggestion, clearSuggestion]);

  useEffect(() => {
    if (!autoHoleEnabled && suppressedSuggestion) {
      setSuppressedSuggestion(null);
    }
  }, [autoHoleEnabled, suppressedSuggestion]);

  const summary = useMemo(() => {
    if (!round) {
      return null;
    }
    const totalPar = round.holes.reduce((sum, hole) => sum + hole.par, 0);
    let totalStrokes = 0;
    let missing = false;
    for (const hole of round.holes) {
      if (typeof hole.strokes === "number") {
        totalStrokes += hole.strokes;
      } else {
        missing = true;
      }
    }
    return {
      totalPar,
      totalStrokes,
      toPar: missing ? null : totalStrokes - totalPar,
    };
  }, [round]);

  if (notFound) {
    return (
      <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/50 p-6 text-slate-100">
        <h1 className="text-xl font-semibold">Rundan hittades inte</h1>
        <Link to="/play" className="text-sm font-semibold text-emerald-300 hover:underline">
          Tillbaka till start
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

  const autoHoleAvailable = Boolean(round.courseId);
  const suggestionReason = suggestion
    ? formatAutoHoleReason(suggestion.reason)
    : null;

  const handleSelectHole = (index: number) => {
    setCurrentHoleNumber(index);
    clearSuggestion();
    setSuppressedSuggestion(null);
  };

  const handleAutoHoleToggle = (value: boolean) => {
    if (!autoHoleAvailable) {
      setAutoHoleEnabled(false);
      return;
    }
    setAutoHoleEnabled(value);
    if (!value) {
      clearSuggestion();
      setSuppressedSuggestion(null);
    }
  };

  const handleAcceptSuggestion = () => {
    if (!suggestion) {
      return;
    }
    setCurrentHoleNumber(suggestion.suggestedHole);
    clearSuggestion();
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
    clearSuggestion();
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
      return updated;
    });
  };

  return (
    <>
      <div className="space-y-8 text-slate-100">
        <header className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-100">{round.courseName}</h1>
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
                  Auto hole detect (beta)
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
      <section className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/60">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Hål</th>
              <th className="px-4 py-3">Par</th>
              <th className="px-4 py-3">Slag</th>
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
          <h2 className="text-lg font-semibold text-slate-100">Summering</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SummaryItem label="Totalt" value={`${summary.totalStrokes} slag`} />
            <SummaryItem label="Par" value={summary.totalPar.toString()} />
            <SummaryItem label="Resultat" value={formatToPar(summary.toPar)} />
          </div>
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
      {autoHoleEnabled && suggestion && (
        <div className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-lg border border-emerald-500/50 bg-slate-950/90 p-4 text-sm text-slate-100 shadow-lg backdrop-blur">
          <p>
            Byt till hål {suggestion.suggestedHole}?
            {suggestionReason ? ` (reason: ${suggestionReason})` : ""}
          </p>
          <div className="mt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleIgnoreSuggestion}
              className="rounded px-3 py-1 text-sm font-semibold text-slate-300 transition hover:text-slate-100"
            >
              Ignorera
            </button>
            <button
              type="button"
              onClick={handleAcceptSuggestion}
              className="rounded bg-emerald-500 px-4 py-1 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400"
            >
              Byt
            </button>
          </div>
        </div>
      )}
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

function formatToPar(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value === 0) {
    return "E";
  }
  return value > 0 ? `+${value}` : `${value}`;
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

function formatAutoHoleReason(reason: string): string {
  const map: Record<string, string> = {
    closest_tee: "nära tee",
    closest_green: "nära green",
    between_green_and_next_tee: "mellan green och nästa tee",
    stay_on_current: "behåll nuvarande hål",
  };
  return map[reason] ?? reason;
}

import React from "react";
import { useTranslation } from "react-i18next";
import { fetchBagStats } from "@/api/bagStatsClient";
import { loadBag, updateClubCarry, upsertClub } from "@web/bag/storage";
import type { BagState, BagClub } from "@web/bag/types";
import { useUnits } from "@/preferences/UnitsContext";
import { convertMeters, formatDistance } from "@/utils/distance";
import { analyzeBagGaps, type ClubDataStatusById } from "@shared/caddie/bagGapInsights";
import { buildBagTuningSuggestions } from "@shared/caddie/bagTuningSuggestions";
import { shouldUseBagStat, type BagClubStatsMap } from "@shared/caddie/bagStats";
import type { PlayerBag } from "@shared/caddie/playerBag";
import { computeBagReadiness } from "@shared/caddie/bagReadiness";

function formatTimestamp(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

function mapToPlayerBag(bag: BagState): PlayerBag {
  return {
    clubs: bag.clubs.map((club) => ({
      clubId: club.id,
      label: club.label,
      avgCarryM: club.carry_m ?? null,
      manualAvgCarryM: club.carry_m ?? null,
      sampleCount: 0,
      active: true,
    })),
  };
}

export default function MyBagPage(): JSX.Element {
  const { t } = useTranslation();
  const { unit } = useUnits();
  const [bag, setBag] = React.useState<BagState>(() => loadBag());
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [newClub, setNewClub] = React.useState<{ id: string; label: string }>({
    id: "",
    label: "",
  });
  const [bagStats, setBagStats] = React.useState<BagClubStatsMap | null>(null);
  const [bagStatsError, setBagStatsError] = React.useState<string | null>(null);
  const [bagStatsLoading, setBagStatsLoading] = React.useState(false);

  const handleCarryChange = React.useCallback(
    (club: BagClub, value: string) => {
      const trimmed = value.trim();
      if (trimmed === "") {
        setBag((prev) => updateClubCarry(prev, club.id, null));
        return;
      }

      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) {
        return;
      }

      const meters = unit === "imperial" ? parsed / 1.0936133 : parsed;
      setBag((prev) => updateClubCarry(prev, club.id, meters));
    },
    [unit]
  );

  const handleLabelChange = React.useCallback((club: BagClub, value: string) => {
    setBag((prev) => upsertClub(prev, { id: club.id, label: value }));
  }, []);

  const handleNotesChange = React.useCallback((club: BagClub, value: string) => {
    const notes = value.trim();
    setBag((prev) => upsertClub(prev, { id: club.id, notes: notes.length > 0 ? notes : null }));
  }, []);

  const handleAddClub = React.useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const id = newClub.id.trim();
      const label = newClub.label.trim();
      if (!id || !label) {
        return;
      }
      setBag((prev) => upsertClub(prev, { id, label, carry_m: null }));
      setNewClub({ id: "", label: "" });
      setShowAddForm(false);
    },
    [newClub]
  );

  React.useEffect(() => {
    let cancelled = false;
    setBagStatsLoading(true);
    fetchBagStats()
      .then((stats) => {
        if (!cancelled) {
          setBagStats(stats);
          setBagStatsError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setBagStatsError(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBagStatsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const playerBag = React.useMemo(() => mapToPlayerBag(bag), [bag]);
  const gapAnalysis = React.useMemo(
    () => (bagStats ? analyzeBagGaps(playerBag, bagStats) : null),
    [bagStats, playerBag]
  );
  const readiness = React.useMemo(
    () => computeBagReadiness(playerBag, bagStats ?? {}),
    [bagStats, playerBag]
  );
  const clubDataStatuses: ClubDataStatusById = gapAnalysis?.dataStatusByClubId ?? {};
  const bagInsights = gapAnalysis?.insights ?? [];
  const bagSuggestions = React.useMemo(
    () =>
      bagStats ? buildBagTuningSuggestions(playerBag, bagStats).suggestions : [],
    [bagStats, playerBag]
  );
  const clubLabels = React.useMemo(() => {
    const labels: Record<string, string> = {};
    bag.clubs.forEach((club) => {
      labels[club.id] = club.label;
    });
    return labels;
  }, [bag.clubs]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">{t("bag.title")}</h1>
        <p className="text-sm text-slate-400">
          Senast uppdaterad: {formatTimestamp(bag.updatedAt)}
        </p>
      </div>

      <div
        className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 shadow"
        data-testid="bag-readiness"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-slate-100">
              {t("bag.readinessTitle")}
            </h2>
            <p className="text-3xl font-extrabold text-slate-50">{readiness.score}/100</p>
            <p className="text-sm text-slate-200">
              {t("bag.readinessSummary.base", {
                calibrated: readiness.calibratedClubs,
                total: readiness.totalClubs,
              })}
            </p>
            <p className="text-xs text-slate-400">
              {t("bag.readinessSummary.details", {
                noData: readiness.noDataCount,
                needsMore: readiness.needsMoreSamplesCount,
                gaps: readiness.largeGapCount,
                overlaps: readiness.overlapCount,
              })}
            </p>
          </div>
          <div className="shrink-0 rounded-full border border-emerald-700/80 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
            {t(`bag.readinessGrade.${readiness.grade}`)}
          </div>
        </div>
      </div>

      {bagStatsError ? (
        <div className="rounded-lg border border-amber-700/80 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {t("bag.insights.load_error")}
        </div>
      ) : null}

      {bagInsights.length > 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 shadow">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-100">
              {t("bag.insights.title")}
            </h2>
            {bagStatsLoading ? (
              <span className="text-xs text-slate-400">{t("bag.loading")}</span>
            ) : null}
          </div>
          <ul className="mt-2 flex flex-col gap-2 text-sm text-slate-200">
            {bagInsights.map((insight) => {
              const lower = clubLabels[insight.lowerClubId] ?? insight.lowerClubId;
              const upper = clubLabels[insight.upperClubId] ?? insight.upperClubId;
              const distance = formatDistance(insight.gapDistance, unit, { withUnit: true });
              const key = `${insight.type}-${insight.lowerClubId}-${insight.upperClubId}`;
              const label =
                insight.type === "large_gap"
                  ? t("bag.insights.large_gap", { lower, upper, distance })
                  : t("bag.insights.overlap", { lower, upper, distance });
              return (
                <li
                  key={key}
                  className="flex items-start gap-2 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
                >
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                  <span>{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {bagSuggestions.length > 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 shadow">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-100">
              {t("bag.suggestions.title")}
            </h2>
            {bagStatsLoading ? (
              <span className="text-xs text-slate-400">{t("bag.loading")}</span>
            ) : null}
          </div>
          <ul className="mt-2 flex flex-col gap-2 text-sm text-slate-200">
            {bagSuggestions.slice(0, 4).map((suggestion) => {
              const lower =
                suggestion.lowerClubId &&
                (clubLabels[suggestion.lowerClubId] ?? suggestion.lowerClubId);
              const upper =
                suggestion.upperClubId &&
                (clubLabels[suggestion.upperClubId] ?? suggestion.upperClubId);
              const clubLabel =
                suggestion.clubId && (clubLabels[suggestion.clubId] ?? suggestion.clubId);
              const distanceLabel =
                suggestion.gapDistance != null
                  ? formatDistance(suggestion.gapDistance, unit, { withUnit: true })
                  : null;

              let label: string | null = null;
              if (suggestion.type === "fill_gap" && lower && upper && distanceLabel) {
                label = t("bag.suggestions.fill_gap", { lower, upper, distance: distanceLabel });
              } else if (suggestion.type === "reduce_overlap" && lower && upper) {
                label = t("bag.suggestions.reduce_overlap", { lower, upper, distance: distanceLabel });
              } else if (suggestion.type === "calibrate" && clubLabel) {
                label = t(
                  suggestion.severity === "high"
                    ? "bag.suggestions.calibrate.no_data"
                    : "bag.suggestions.calibrate.needs_more_samples",
                  { club: clubLabel }
                );
              }

              return label ? (
                <li
                  key={suggestion.id}
                  className="flex items-start gap-2 rounded border border-slate-800 bg-slate-950/60 px-3 py-2"
                >
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                  <span>{label}</span>
                </li>
              ) : null;
            })}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">{t("bag.club")}</th>
                <th className="px-4 py-3 font-medium">Id</th>
                <th className="px-4 py-3 font-medium">
                  {t("bag.carry", { unit: unit === "metric" ? "m" : "yd" })}
                </th>
                <th className="px-4 py-3 font-medium">{t("bag.notes")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {bag.clubs.map((club) => (
                <tr key={club.id}>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={club.label}
                      onChange={(event) => handleLabelChange(club, event.target.value)}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs uppercase tracking-wide text-slate-400">
                      {club.id}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={
                        club.carry_m == null
                          ? ""
                          : Math.round((convertMeters(club.carry_m, unit) ?? 0) * 10) / 10
                      }
                      onChange={(event) => handleCarryChange(club, event.target.value)}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                      placeholder="—"
                    />
                    {(() => {
                      const stat = bagStats?.[club.id];
                      const status = clubDataStatuses[club.id];
                      const autoCarryLabel = shouldUseBagStat(stat)
                        ? formatDistance(stat.meanDistanceM, unit, { withUnit: true })
                        : null;
                      const baseCarryLabel =
                        club.carry_m != null
                          ? formatDistance(club.carry_m, unit, { withUnit: true })
                          : t("bag.noCarry");
                      const hasStat = Boolean(stat);
                      const hasSamples = (stat?.sampleCount ?? 0) > 0;
                      const showNeedsMore =
                        (status === "needs_more_samples" || (hasStat && hasSamples)) && !autoCarryLabel;
                      const showNoData = status === "no_data" || (hasStat && !hasSamples);

                      return (
                        <div className="mt-1 space-y-1">
                          <p className="text-xs text-slate-500">{baseCarryLabel}</p>
                          {autoCarryLabel ? (
                            <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-300">
                              <span className="rounded border border-emerald-700/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                {t("bag.insights.auto_label")}
                              </span>
                              <span>{autoCarryLabel}</span>
                              {stat?.sampleCount ? (
                                <span className="text-slate-500">
                                  {t("bag.insights.sample_count", { count: stat.sampleCount })}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          {showNeedsMore ? (
                            <p className="text-xs text-amber-300">{t("bag.insights.needs_more_samples")}</p>
                          ) : null}
                          {showNoData ? (
                            <p className="text-xs text-slate-400">{t("bag.insights.no_data")}</p>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={club.notes ?? ""}
                      onChange={(event) => handleNotesChange(club, event.target.value)}
                      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                      placeholder="Valfritt"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
        <p className="mb-3">
          Dessa längder används av GolfIQs caddie och gapping. Du kan uppdatera dem manuellt eller från rangen.
        </p>
        <button
          type="button"
          onClick={() => setShowAddForm((value) => !value)}
          className="rounded border border-emerald-600 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/10"
        >
          {showAddForm ? "Avbryt" : "Lägg till klubb"}
        </button>
        {showAddForm && (
          <form onSubmit={handleAddClub} className="mt-3 flex flex-col gap-3 sm:flex-row">
            <label className="flex flex-1 flex-col gap-1 text-xs text-slate-300">
              Id
              <input
                type="text"
                value={newClub.id}
                onChange={(event) =>
                  setNewClub((prev) => ({ ...prev, id: event.target.value.toUpperCase() }))
                }
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                placeholder="t.ex. 4H"
                required
              />
            </label>
            <label className="flex flex-[2] flex-col gap-1 text-xs text-slate-300">
              Namn
              <input
                type="text"
                value={newClub.label}
                onChange={(event) => setNewClub((prev) => ({ ...prev, label: event.target.value }))}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                placeholder="t.ex. Hybrid 4"
                required
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Spara
              </button>
            </div>
          </form>
        )}
        <p className="mt-4 text-xs text-slate-500">
          Kör gapping på rangen för att uppdatera längder automatiskt.
        </p>
      </div>
    </div>
  );
}

import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { loadAllRoundsFull } from "@/features/quickround/storage";
import type { QuickRound } from "@/features/quickround/types";
import { listGhosts } from "@/features/range/ghost";
import { loadBag, updateClubCarry } from "@/bag/storage";
import { FeatureGate } from "@/access/FeatureGate";
import { BetaBadge } from "@/access/BetaBadge";
import {
  computeBagSummary,
  computeQuickRoundStats,
  computeRangeSummary,
} from "@/profile/stats";
import {
  getCoachTag,
  loadRangeSessions,
  type RangeSession,
} from "@/features/range/sessions";
import { computeCarrySuggestions, type CarrySuggestion } from "@/bag/smart_sync";
import { computeInsights } from "@/profile/insights";

export default function MyGolfIQPage() {
  const { t } = useTranslation();
  const [rounds] = useState(() => loadAllRoundsFull());
  const [ghosts] = useState(() => listGhosts());
  const [bagState, setBagState] = useState(() => loadBag());
  const [rangeSessions] = useState<RangeSession[]>(() => loadRangeSessions());

  const quickRoundStats = useMemo(() => computeQuickRoundStats(rounds), [rounds]);
  const rangeStats = useMemo(() => computeRangeSummary(ghosts), [ghosts]);
  const bagStats = useMemo(() => computeBagSummary(bagState), [bagState]);
  const suggestions = useMemo<CarrySuggestion[]>(
    () => computeCarrySuggestions(bagState, rangeSessions),
    [bagState, rangeSessions]
  );
  const insights = useMemo(
    () => computeInsights({ rounds, rangeSessions }),
    [rounds, rangeSessions]
  );
  const recentRangeSessions = useMemo(
    () => rangeSessions.slice(0, 5),
    [rangeSessions]
  );

  const recentRounds = useMemo(() => {
    return [...rounds]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 5);
  }, [rounds]);

  const handleApplySuggestion = useCallback(
    (suggestion: CarrySuggestion) => {
      setBagState((prev) => updateClubCarry(prev, suggestion.clubId, suggestion.suggestedCarry_m));
    },
    []
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">{t("profile.title")}</h1>
        <p className="mt-1 text-sm text-slate-400">{t("profile.subtitle")}</p>
      </div>

      <FeatureGate feature="profile.insights">
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-800">
              {t("profile.insights.title")}
            </h2>
            <BetaBadge />
          </div>
          {insights.strengths.length === 0 && insights.focuses.length === 0 ? (
            <p className="text-sm text-slate-500">{t("profile.insights.empty")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase text-emerald-700">
                  {t("profile.insights.strengths")}
                </h3>
                {insights.strengths.length === 0 ? (
                  <p className="text-xs text-slate-500">{t("profile.insights.noneYet")}</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-4">
                    {insights.strengths.map((insight) => (
                      <li key={insight.id}>{t(`profile.insights.${insight.id}`)}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase text-rose-700">
                  {t("profile.insights.focuses")}
                </h3>
                {insights.focuses.length === 0 ? (
                  <p className="text-xs text-slate-500">{t("profile.insights.noneYet")}</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-4">
                    {insights.focuses.map((insight) => (
                      <li key={insight.id}>{t(`profile.insights.${insight.id}`)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {insights.suggestedMission && (
            <div className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
              {t("profile.insights.suggestedMission", {
                mission: insights.suggestedMission,
              })}
            </div>
          )}
        </section>
      </FeatureGate>

      <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-100">
            {t("profile.quickRounds.title")}
          </h2>
          {quickRoundStats.totalRounds > 0 && (
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {t("profile.quickRounds.recent")}
            </span>
          )}
        </div>

        {quickRoundStats.totalRounds === 0 ? (
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>{t("profile.quickRounds.empty")}</p>
            <Link className="inline-flex text-emerald-300 hover:text-emerald-200" to="/play">
              {t("profile.quickRounds.goPlayCta")}
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <StatBlock
                label={t("profile.quickRounds.totalRounds")}
                value={quickRoundStats.totalRounds.toString()}
              />
              <StatBlock
                label={t("profile.quickRounds.completedRounds")}
                value={quickRoundStats.completedRounds.toString()}
              />
              {typeof quickRoundStats.avgStrokes === "number" && (
                <StatBlock
                  label={t("profile.quickRounds.avgStrokes")}
                  value={formatDecimal(quickRoundStats.avgStrokes)}
                />
              )}
              {typeof quickRoundStats.avgNetStrokes === "number" && (
                <StatBlock
                  label={t("profile.quickRounds.avgNetStrokes")}
                  value={formatDecimal(quickRoundStats.avgNetStrokes)}
                />
              )}
            </dl>

            <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
              <h3 className="mb-3 text-sm font-semibold text-emerald-200">
                {t("profile.quickRounds.advancedInsights")}
              </h3>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                {typeof quickRoundStats.avgToPar === "number" ? (
                  <StatBlock
                    label={t("profile.quickRounds.avgToPar")}
                    value={formatToPar(quickRoundStats.avgToPar)}
                  />
                ) : null}
                {typeof quickRoundStats.avgNetToPar === "number" ? (
                  <StatBlock
                    label={t("profile.quickRounds.avgNetToPar")}
                    value={formatToPar(quickRoundStats.avgNetToPar)}
                  />
                ) : null}
                {typeof quickRoundStats.bestToPar === "number" ? (
                  <StatBlock
                    label={t("profile.quickRounds.bestToPar")}
                    value={formatToPar(quickRoundStats.bestToPar)}
                  />
                ) : null}
              </dl>
            </div>

            {recentRounds.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-200">
                  {t("profile.quickRounds.recent")}
                </h3>
                <ul className="divide-y divide-slate-800 rounded-md border border-slate-800">
                  {recentRounds.map((round) => {
                    const toPar = getRoundToPar(round);
                    return (
                      <li key={round.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-100">{round.courseName}</p>
                          <p className="text-xs text-slate-400">{formatDate(round.startedAt)}</p>
                        </div>
                        <div className="text-sm font-semibold text-slate-200">
                          {typeof toPar === "number"
                            ? formatToPar(toPar)
                            : t("profile.quickRounds.noScore")}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-100">
            {t("profile.range.title")}
          </h2>
          {rangeStats.ghostCount > 0 && (
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {t("profile.range.lastGhost")}
            </span>
          )}
        </div>

        {rangeStats.ghostCount === 0 ? (
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>{t("profile.range.empty")}</p>
            <Link className="inline-flex text-emerald-300 hover:text-emerald-200" to="/range/practice">
              {t("profile.range.practiceCta")}
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-4 text-sm text-slate-200">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <StatBlock
                label={t("profile.range.ghostCount")}
                value={rangeStats.ghostCount.toString()}
              />
            </dl>

            {rangeStats.lastGhost && (
              <div className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-slate-100">
                    {t("profile.range.lastGhostLabel", { name: rangeStats.lastGhost.name })}
                  </p>
                  <p className="text-xs text-slate-400">{formatDate(rangeStats.lastGhost.createdAt)}</p>
                </div>
                <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <StatBlock
                    label={t("profile.range.stats.totalShots")}
                    value={rangeStats.lastGhost.result.totalShots.toString()}
                  />
                  <StatBlock
                    label={t("profile.range.stats.hits")}
                    value={rangeStats.lastGhost.result.hits.toString()}
                  />
                  <StatBlock
                    label={t("profile.range.stats.hitRate")}
                    value={`${formatDecimal(rangeStats.lastGhost.result.hitRate_pct)}%`}
                  />
                  <StatBlock
                    label={t("profile.range.stats.avgError")}
                    value={
                      typeof rangeStats.lastGhost.result.avgAbsError_m === "number"
                        ? `${formatDecimal(rangeStats.lastGhost.result.avgAbsError_m)} m`
                        : t("profile.range.stats.noErrorData")
                    }
                  />
                </dl>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/50 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-100">
          {t("profile.range.sessions.title")}
        </h2>
        {recentRangeSessions.length === 0 ? (
          <p className="text-sm text-slate-300">
            {t("profile.range.sessions.empty")}
          </p>
        ) : (
          <ul className="space-y-3 text-sm">
            {recentRangeSessions.map((session) => {
              const tag = getCoachTag(session);
              const endedAt = session.endedAt ?? session.startedAt;
              const dateLabel = endedAt
                ? new Date(endedAt).toLocaleString()
                : t("profile.range.sessions.unknownDate");
              return (
                <li
                  key={session.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3"
                >
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-100">{dateLabel}</div>
                    <div className="text-xs text-slate-400">
                      {session.missionId
                        ? t("profile.range.sessions.missionLabel", { mission: session.missionId })
                        : t("profile.range.sessions.noMission")}
                    </div>
                    <div className="text-xs text-slate-400">
                      {t("profile.range.sessions.shotStats", {
                        shots: session.shotCount,
                        avg:
                          typeof session.avgCarry_m === "number"
                            ? Math.round(session.avgCarry_m)
                            : "–",
                        std:
                          typeof session.carryStd_m === "number"
                            ? Math.round(session.carryStd_m)
                            : "–",
                      })}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-emerald-300">
                    {t(`profile.range.sessions.tag.${tag}`)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-100">
            {t("profile.bag.title")}
          </h2>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-200">
          <p>
            {t("profile.bag.clubsWithCarry", {
              count: bagStats.clubsWithCarry,
              total: bagStats.totalClubs,
            })}
          </p>
          {bagStats.clubsWithCarry < bagStats.totalClubs && (
            <Link className="inline-flex text-emerald-300 hover:text-emerald-200" to="/bag">
              {t("profile.bag.completeBagCta")}
            </Link>
          )}
        </div>
      </section>

      <FeatureGate feature="profile.smartBagSuggestions">
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-800">
              {t("profile.bag.smartSync.title")}
            </h2>
            <BetaBadge />
          </div>
          {suggestions.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t("profile.bag.smartSync.empty")}
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {suggestions.slice(0, 5).map((suggestion) => (
                <li
                  key={suggestion.clubId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <div>
                    <div className="font-medium">{suggestion.clubLabel}</div>
                    <div className="text-xs text-slate-500">
                      {t("profile.bag.smartSync.line", {
                        current:
                          suggestion.currentCarry_m != null
                            ? suggestion.currentCarry_m
                            : t("profile.bag.smartSync.noCurrent"),
                        suggested: suggestion.suggestedCarry_m,
                        sessions: suggestion.sampleCount,
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center rounded-md border border-emerald-500 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                    onClick={() => handleApplySuggestion(suggestion)}
                  >
                    {t("profile.bag.smartSync.apply")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </FeatureGate>
    </div>
  );
}

type StatBlockProps = {
  label: string;
  value: string;
};

function StatBlock({ label, value }: StatBlockProps) {
  return (
    <div className="flex flex-col rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

function getRoundToPar(round: QuickRound): number | undefined {
  if (!round.completedAt) {
    return undefined;
  }

  let strokesTotal = 0;
  let parTotal = 0;
  let countedHoles = 0;

  round.holes.forEach((hole) => {
    if (typeof hole.strokes === "number" && !Number.isNaN(hole.strokes)) {
      strokesTotal += hole.strokes;
      parTotal += typeof hole.par === "number" && !Number.isNaN(hole.par) ? hole.par : 0;
      countedHoles += 1;
    }
  });

  if (countedHoles === 0) {
    return undefined;
  }

  return strokesTotal - parTotal;
}

function formatDate(value: string | number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

function formatToPar(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) < 0.05) {
    return "E";
  }
  const formatted = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  return rounded > 0 ? `+${formatted}` : formatted;
}

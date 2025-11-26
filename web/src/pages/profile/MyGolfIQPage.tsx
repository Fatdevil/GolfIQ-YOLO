import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { loadAllRoundsFull } from "@/features/quickround/storage";
import type { QuickRound } from "@/features/quickround/types";
import { listGhosts } from "@/features/range/ghost";
import { loadBag } from "@/bag/storage";
import {
  computeBagSummary,
  computeQuickRoundStats,
  computeRangeSummary,
} from "@/profile/stats";
import {
  fetchCaddieInsights,
  type CaddieInsights,
} from "@/api/caddieInsights";
import { UpgradeGate } from "@/access/UpgradeGate";
import { usePlan } from "@/access/PlanProvider";
import { useCaddieMemberId } from "@/profile/memberIdentity";
import { migrateLocalHistoryOnce } from "@/user/historyMigration";
import { useUserSession } from "@/user/UserSessionContext";
import { loadRangeSessions } from "@/features/range/sessions";
import { useCoachInsights } from "@/profile/useCoachInsights";

export function MyGolfIQPage() {
  const { t } = useTranslation();
  const { session: userSession } = useUserSession();
  const { plan } = usePlan();
  const memberId = useCaddieMemberId();
  const coach = useCoachInsights();
  const rounds = useMemo(() => loadAllRoundsFull(), []);
  const ghosts = useMemo(() => listGhosts(), []);
  const bag = useMemo(() => loadBag(), []);
  const rangeSessions = useMemo(() => loadRangeSessions(), []);
  const bingoSessions = useMemo(
    () => rangeSessions.filter((session) => session.gameType === "TARGET_BINGO_V1"),
    [rangeSessions]
  );
  const bestBingoLines = useMemo(
    () =>
      bingoSessions.reduce(
        (max, session) => Math.max(max, session.bingoLines ?? 0),
        0
      ),
    [bingoSessions]
  );
  const ghostMatchSessions = useMemo(
    () => rangeSessions.filter((session) => session.gameType === "GHOSTMATCH_V1"),
    [rangeSessions]
  );
  const bestGhostDelta = useMemo(
    () =>
      ghostMatchSessions.reduce(
        (best, session) =>
          typeof session.ghostScoreDelta === "number"
            ? Math.min(best, session.ghostScoreDelta)
            : best,
        Number.POSITIVE_INFINITY,
      ),
    [ghostMatchSessions],
  );

  const [insights, setInsights] = useState<CaddieInsights | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const qrStats = useMemo(() => computeQuickRoundStats(rounds), [rounds]);
  const rangeStats = useMemo(() => computeRangeSummary(ghosts), [ghosts]);
  const bagStats = useMemo(() => computeBagSummary(bag), [bag]);
  const topClubStats = useMemo(() => {
    if (!insights) return [];
    return [...insights.per_club].sort((a, b) => b.shown - a.shown).slice(0, 5);
  }, [insights]);

  const recentRounds = useMemo(() => {
    return [...rounds]
      .sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )
      .slice(0, 5);
  }, [rounds]);

  const userId = userSession?.userId ?? "";

  useEffect(() => {
    if (!memberId) {
      setInsights(null);
      setLoadingInsights(false);
      return;
    }

    setLoadingInsights(true);
    setInsights(null);
    setInsightsError(null);

    fetchCaddieInsights(memberId, 30)
      .then((data) => {
        setInsights(data);
      })
      .catch(() => {
        setInsightsError("load_failed");
      })
      .finally(() => {
        setLoadingInsights(false);
      });
  }, [memberId]);

  useEffect(() => {
    if (!userId) return;
    migrateLocalHistoryOnce(userId, rounds, rangeSessions).catch(() => {
      // Soft-fail; this should not block the profile page.
    });
  }, [userId, rounds, rangeSessions]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{t("profile.title")}</h1>
          <span className="inline-flex items-center px-2 py-[2px] rounded-full border border-slate-700 bg-slate-900/60 text-[10px] font-semibold uppercase tracking-wide text-slate-200">
            {plan === "PRO" ? t("access.plan.pro") : t("access.plan.free")}
          </span>
        </div>
        <p className="text-sm text-slate-500">{t("profile.subtitle")}</p>
      </header>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-50">
            {t("profile.quickRounds.title")}
          </h2>
          {qrStats.totalRounds > 0 && (
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {t("profile.quickRounds.recent")}
            </span>
          )}
        </div>

        {qrStats.totalRounds === 0 ? (
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>{t("profile.quickRounds.empty")}</p>
            <Link className="inline-flex text-emerald-300 hover:text-emerald-200" to="/play">
              {t("profile.quickRounds.goPlayCta")}
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <StatItem label={t("profile.quickRounds.totalRounds")} value={qrStats.totalRounds} />
              <StatItem
                label={t("profile.quickRounds.completedRounds")} value={qrStats.completedRounds}
              />
              {typeof qrStats.avgStrokes === "number" && (
                <StatItem label={t("profile.quickRounds.avgStrokes")} value={qrStats.avgStrokes} />
              )}
              {typeof qrStats.avgToPar === "number" && (
                <StatItem label={t("profile.quickRounds.avgToPar")} value={formatToPar(qrStats.avgToPar)} />
              )}
              {typeof qrStats.bestToPar === "number" && (
                <StatItem label={t("profile.quickRounds.bestToPar")} value={formatToPar(qrStats.bestToPar)} />
              )}
            </dl>

            {recentRounds.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-100">
                  {t("profile.quickRounds.recent")}
                </h3>
                <ul className="divide-y divide-slate-800 overflow-hidden rounded-md border border-slate-800">
                  {recentRounds.map((round) => {
                    const toPar = computeRoundToPar(round);
                    const courseLabel = round.courseName ?? t("profile.quickRounds.unknownCourse");
                    return (
                      <li
                        key={round.id}
                        className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-100">{courseLabel}</p>
                          <p className="text-xs text-slate-400">{formatDate(round.startedAt)}</p>
                        </div>
                        <div className="text-sm font-semibold text-slate-100">
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
            <p className="text-xs text-slate-500">{t("profile.sg.previewHint")}</p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-50">
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
            <Link
              className="inline-flex text-emerald-300 hover:text-emerald-200"
              to="/range/practice"
            >
              {t("profile.range.practiceCta")}
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-4 text-sm text-slate-200">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <StatItem label={t("profile.range.ghostCount") } value={rangeStats.ghostCount} />
            </dl>

            {bingoSessions.length > 0 && (
              <p className="text-xs text-emerald-300">
                {t("profile.range.bingoSummary", {
                  count: bingoSessions.length,
                  best: bestBingoLines,
                })}
              </p>
            )}

            {ghostMatchSessions.length > 0 && (
              <p className="text-xs text-slate-600">
                {t("profile.range.ghostSummary", {
                  count: ghostMatchSessions.length,
                  bestDelta:
                    bestGhostDelta === Number.POSITIVE_INFINITY ? 0 : bestGhostDelta,
                })}
              </p>
            )}

            {rangeStats.lastGhost && (
              <div className="rounded-md border border-slate-800 bg-slate-900/70 p-4 space-y-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-slate-100">
                    {t("profile.range.lastGhostLabel", { name: rangeStats.lastGhost.name })}
                  </p>
                  <p className="text-xs text-slate-400">{formatDate(rangeStats.lastGhost.createdAt)}</p>
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <StatItem
                    label={t("profile.range.stats.totalShots")}
                    value={rangeStats.lastGhost.result.totalShots}
                  />
                  <StatItem
                    label={t("profile.range.stats.hits")}
                    value={rangeStats.lastGhost.result.hits}
                  />
                  {typeof rangeStats.lastGhost.result.hitRate_pct === "number" && (
                    <StatItem
                      label={t("profile.range.stats.hitRate")}
                      value={`${formatNumber(rangeStats.lastGhost.result.hitRate_pct)}%`}
                    />
                  )}
                  <StatItem
                    label={t("profile.range.stats.avgError")}
                    value={
                      typeof rangeStats.lastGhost.result.avgAbsError_m === "number"
                        ? `${formatNumber(rangeStats.lastGhost.result.avgAbsError_m)} m`
                        : t("profile.range.stats.noErrorData")
                    }
                  />
                </dl>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-50">{t("profile.bag.title")}</h2>
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

      <UpgradeGate feature="CADDIE_INSIGHTS">
        <div className="space-y-4">
          <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
            <header className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-50">{t("profile.coach.title")}</h2>
                <p className="text-xs text-slate-400">{t("profile.coach.subtitle")}</p>
              </div>
            </header>

            {coach.status === "loading" && (
              <p className="mt-3 text-xs text-slate-400">{t("profile.coach.loading")}</p>
            )}

            {coach.status === "error" && (
              <p className="mt-3 text-xs text-amber-400">{t("profile.coach.error")}</p>
            )}

            {coach.status === "empty" && (
              <p className="mt-3 text-xs text-slate-400">{t("profile.coach.empty")}</p>
            )}

            {coach.status === "ready" && (
              <div className="mt-3 space-y-2 text-xs text-slate-100">
                <ul className="space-y-1">
                  {coach.suggestions.map((s, idx) => {
                    if (s.type === "sg" && s.categoryKey) {
                      return (
                        <li key={idx}>
                          {t(s.messageKey, {
                            category: t(`coach.sg.category.${s.categoryKey}`),
                          })}
                        </li>
                      );
                    }
                    if (s.type === "caddie" && s.club) {
                      return <li key={idx}>{t(s.messageKey, { club: s.club })}</li>;
                    }
                    return null;
                  })}
                </ul>

                <div className="flex gap-3">
                  <Link className="text-[11px] underline text-emerald-300" to="/range/practice">
                    {t("profile.coach.cta.range")}
                  </Link>
                  <Link className="text-[11px] underline text-emerald-300" to="/play">
                    {t("profile.coach.cta.quick")}
                  </Link>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-50">{t("profile.caddie.title")}</h2>
              <p className="text-sm text-slate-400">{t("profile.caddie.subtitle")}</p>
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-200">
              {!memberId ? (
                <p className="text-slate-300">{t("profile.caddie.noMember")}</p>
              ) : (
                <>
                  {insightsError && (
                    <div className="rounded-md border border-amber-800 bg-amber-900/40 px-3 py-2 text-amber-100">
                      {t("profile.caddie.loadFailed")}
                    </div>
                  )}

                  {loadingInsights && !insights && (
                    <p className="text-slate-300">{t("profile.caddie.loading")}</p>
                  )}

                  {insights && insights.advice_shown > 0 && (
                    <div className="space-y-4">
                      <dl className="grid gap-4 text-sm sm:grid-cols-3">
                        <StatItem
                          label={t("profile.caddie.summary.shown")}
                          value={insights.advice_shown}
                        />
                        <StatItem
                          label={t("profile.caddie.summary.accepted")}
                          value={insights.advice_accepted}
                        />
                        <StatItem
                          label={t("profile.caddie.summary.acceptRate")}
                          value={
                            typeof insights.accept_rate === "number"
                              ? `${formatNumber(insights.accept_rate * 100)}%`
                              : "—"
                          }
                        />
                      </dl>

                      {topClubStats.length > 0 && (
                        <div className="overflow-hidden rounded-md border border-slate-800">
                          <table className="min-w-full divide-y divide-slate-800 text-sm">
                            <thead className="bg-slate-900/50 text-slate-400">
                              <tr>
                                <th className="px-4 py-2 text-left font-medium">
                                  {t("profile.caddie.table.club")}
                                </th>
                                <th className="px-4 py-2 text-right font-medium">
                                  {t("profile.caddie.table.shown")}
                                </th>
                                <th className="px-4 py-2 text-right font-medium">
                                  {t("profile.caddie.table.accepted")}
                                </th>
                                <th className="px-4 py-2 text-right font-medium">
                                  {t("profile.caddie.table.acceptRate")}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 bg-slate-900/30 text-slate-100">
                              {topClubStats.map((club) => {
                                const clubAcceptRate =
                                  club.shown > 0
                                    ? `${formatNumber((club.accepted / club.shown) * 100)}%`
                                    : "—";
                                return (
                                  <tr key={club.club}>
                                    <td className="px-4 py-2 font-medium">{club.club}</td>
                                    <td className="px-4 py-2 text-right">{club.shown}</td>
                                    <td className="px-4 py-2 text-right">{club.accepted}</td>
                                    <td className="px-4 py-2 text-right">{clubAcceptRate}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {insights && insights.advice_shown === 0 && !loadingInsights && (
                    <p className="text-slate-300">{t("profile.caddie.empty")}</p>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </UpgradeGate>
    </div>
  );
}

export default MyGolfIQPage;

function formatToPar(toPar: number): string {
  if (!Number.isFinite(toPar)) return "—";
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${formatNumber(toPar)}` : formatNumber(toPar);
}

function computeRoundToPar(round: QuickRound): number | undefined {
  if (!round.completedAt) return undefined;

  let strokesTotal = 0;
  let parTotal = 0;
  let hasData = false;

  round.holes.forEach((hole) => {
    if (typeof hole.strokes === "number" && Number.isFinite(hole.strokes)) {
      strokesTotal += hole.strokes;
      parTotal += typeof hole.par === "number" && Number.isFinite(hole.par) ? hole.par : 0;
      hasData = true;
    }
  });

  if (!hasData) return undefined;

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

function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-base font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

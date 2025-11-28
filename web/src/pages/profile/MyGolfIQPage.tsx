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
  type ClubInsight,
} from "@/api/caddieInsights";
import { fetchMemberSgSummary, type MemberSgSummary } from "@/api/sgSummary";
import { UpgradeGate } from "@/access/UpgradeGate";
import { useAccessFeatures, useAccessPlan } from "@/access/UserAccessContext";
import { useCaddieMemberId } from "@/profile/memberIdentity";
import { migrateLocalHistoryOnce } from "@/user/historyMigration";
import { useUserSession } from "@/user/UserSessionContext";
import { loadRangeSessions } from "@/features/range/sessions";
import { markProfileSeen } from "@/onboarding/checklist";
import { buildCoachRecommendations, type SgSummaryForRun } from "@/coach/coachLogic";
import { CoachPlanCard } from "@/coach/CoachPlanCard";
import { ShareWithCoachButton } from "@/coach/ShareWithCoachButton";

export function MyGolfIQPage() {
  const { t } = useTranslation();
  const { session: userSession } = useUserSession();
  const { plan } = useAccessPlan();
  const { hasPlanFeature } = useAccessFeatures();
  const memberId = useCaddieMemberId();
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
  const [sgSummary, setSgSummary] = useState<MemberSgSummary | null>(null);
  const [sgSummaryStatus, setSgSummaryStatus] =
    useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");

  const coachSummary = useMemo<SgSummaryForRun | null>(() => {
    if (!sgSummary) return null;
    return {
      total_sg: sgSummary.avg_sg_per_round,
      sg_by_cat: {
        TEE: sgSummary.per_category.TEE?.avg_sg ?? 0,
        APPROACH: sgSummary.per_category.APPROACH?.avg_sg ?? 0,
        SHORT: sgSummary.per_category.SHORT?.avg_sg ?? 0,
        PUTT: sgSummary.per_category.PUTT?.avg_sg ?? 0,
      },
    };
  }, [sgSummary]);

  const coachRecommendations = useMemo(
    () => (coachSummary ? buildCoachRecommendations({ sgSummary: coachSummary }) : []),
    [coachSummary],
  );

  const coachStatus: "loading" | "error" | "empty" | "ready" = useMemo(() => {
    if (sgSummaryStatus === "loading") return "loading";
    if (sgSummaryStatus === "error") return "error";
    if (!coachSummary) return "empty";
    return coachRecommendations.length > 0 ? "ready" : "empty";
  }, [coachSummary, coachRecommendations.length, sgSummaryStatus]);

  const qrStats = useMemo(() => computeQuickRoundStats(rounds), [rounds]);
  const rangeStats = useMemo(() => computeRangeSummary(ghosts), [ghosts]);
  const bagStats = useMemo(() => computeBagSummary(bag), [bag]);
  const clubInsights = useMemo<ClubInsight[]>(() => {
    if (!insights) return [];
    if (insights.clubs?.length) return insights.clubs;
    return insights.per_club.map((club) => ({
      club_id: club.club,
      total_tips: club.shown,
      accepted: club.accepted,
      ignored: Math.max(club.shown - club.accepted, 0),
      recent_accepted: club.accepted,
      recent_total: club.shown,
      trust_score: club.shown > 0 ? club.accepted / club.shown : 0,
    }));
  }, [insights]);

  const topClubStats = useMemo(() => {
    if (!clubInsights.length) return [];
    return [...clubInsights].sort((a, b) => b.total_tips - a.total_tips).slice(0, 5);
  }, [clubInsights]);

  const mostTrustedClub = useMemo(() => {
    const valid = clubInsights.filter((club) => club.total_tips > 0);
    if (!valid.length) return null;
    return valid.reduce((best, current) =>
      current.trust_score > best.trust_score ? current : best,
    );
  }, [clubInsights]);

  const leastTrustedClub = useMemo(() => {
    const valid = clubInsights.filter((club) => club.total_tips > 0);
    if (!valid.length) return null;
    return valid.reduce((worst, current) =>
      current.trust_score < worst.trust_score ? current : worst,
    );
  }, [clubInsights]);

  const recentRounds = useMemo(() => {
    return [...rounds]
      .sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )
      .slice(0, 5);
  }, [rounds]);

  const latestRunWithId = useMemo(() => {
    return [...rounds]
      .sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      )
      .find((round) => Boolean(round.runId));
  }, [rounds]);

  const userId = userSession?.userId ?? "";

  useEffect(() => {
    markProfileSeen();
  }, []);

  useEffect(() => {
    if (!memberId || !hasPlanFeature("CADDIE_INSIGHTS")) {
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
  }, [hasPlanFeature, memberId]);

  useEffect(() => {
    if (!memberId) {
      setSgSummary(null);
      setSgSummaryStatus("empty");
      return;
    }

    let cancelled = false;
    setSgSummaryStatus("loading");

    fetchMemberSgSummary(memberId, 5)
      .then((data) => {
        if (cancelled) return;
        if (!data.runIds.length) {
          setSgSummary(null);
          setSgSummaryStatus("empty");
        } else {
          setSgSummary(data);
          setSgSummaryStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSgSummaryStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
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
            {plan === "pro" ? t("access.plan.pro") : t("access.plan.free")}
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

      <UpgradeGate feature="SG_PREVIEW">
        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 shadow-sm space-y-2">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-50">
                {t("profile.sgSummary.title")}
              </h2>
              <p className="text-xs text-slate-400">{t("profile.sgSummary.subtitle")}</p>
            </div>
          </header>

          {sgSummaryStatus === "loading" && (
            <p className="text-xs text-slate-400">{t("profile.sgSummary.loading")}</p>
          )}

          {sgSummaryStatus === "error" && (
            <p className="text-xs text-amber-400">{t("profile.sgSummary.error")}</p>
          )}

          {sgSummaryStatus === "empty" && (
            <p className="text-xs text-slate-400">{t("profile.sgSummary.empty")}</p>
          )}

          {sgSummaryStatus === "ready" && sgSummary && (
            <div className="space-y-3 text-xs text-slate-100">
              <p className="text-sm font-medium text-slate-100">
                {t("profile.sgSummary.total", {
                  value: sgSummary.avg_sg_per_round.toFixed(2),
                  rounds: sgSummary.runIds.length,
                })}
              </p>

              <div className="overflow-hidden rounded-md border border-slate-800">
                <table className="min-w-full divide-y divide-slate-800 text-[11px]">
                  <thead className="bg-slate-900/60 text-slate-400">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">
                        {t("profile.sgSummary.catHeader")}
                      </th>
                      <th className="px-4 py-2 text-right font-medium">
                        {t("profile.sgSummary.avgHeader")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/40 text-slate-100">
                    {(["TEE", "APPROACH", "SHORT", "PUTT"] as const).map((cat) => {
                      const catSummary = sgSummary.per_category[cat];
                      if (!catSummary) return null;
                      return (
                        <tr key={cat}>
                          <td className="px-4 py-2 font-medium">
                            {t(`coach.sg.category.${cat.toLowerCase()}`)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono">
                            {catSummary.avg_sg.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </UpgradeGate>

      <UpgradeGate feature="COACH_PLAN">
        <CoachPlanCard status={coachStatus} recommendations={coachRecommendations} />
      </UpgradeGate>

      {latestRunWithId?.runId ? (
        <div className="flex justify-end">
          <ShareWithCoachButton runId={latestRunWithId.runId} />
        </div>
      ) : null}

      <UpgradeGate feature="CADDIE_INSIGHTS">
        <div className="space-y-4">
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

                      {mostTrustedClub && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-md border border-emerald-800 bg-emerald-900/20 px-4 py-3 text-emerald-50">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                              Most trusted
                            </p>
                            <p className="text-lg font-semibold">{mostTrustedClub.club_id}</p>
                            <p className="text-sm text-emerald-100/80">
                              Trust {formatNumber(mostTrustedClub.trust_score * 100)}% • Recent{' '}
                              {formatAcceptPercent(
                                mostTrustedClub.recent_accepted,
                                mostTrustedClub.recent_total,
                              )}
                            </p>
                          </div>

                          {leastTrustedClub && (
                            <div className="rounded-md border border-amber-800 bg-amber-900/20 px-4 py-3 text-amber-50">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                                Often ignored
                              </p>
                              <p className="text-lg font-semibold">{leastTrustedClub.club_id}</p>
                              <p className="text-sm text-amber-100/80">
                                Trust {formatNumber(leastTrustedClub.trust_score * 100)}% • Ignored{' '}
                                {leastTrustedClub.ignored} tips
                              </p>
                            </div>
                          )}
                        </div>
                      )}

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
                                <th className="px-4 py-2 text-right font-medium">Trust</th>
                                <th className="px-4 py-2 text-right font-medium">Recent</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 bg-slate-900/30 text-slate-100">
                              {topClubStats.map((club) => {
                                const trustPercent = `${formatNumber(club.trust_score * 100)}%`;
                                return (
                                  <tr key={club.club_id}>
                                    <td className="px-4 py-2 font-medium">{club.club_id}</td>
                                    <td className="px-4 py-2 text-right">{club.total_tips}</td>
                                    <td className="px-4 py-2 text-right">{club.accepted}</td>
                                    <td className="px-4 py-2 text-right">{trustPercent}</td>
                                    <td className="px-4 py-2 text-right">
                                      {formatAcceptPercent(club.recent_accepted, club.recent_total)}
                                    </td>
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

function formatAcceptPercent(accepted: number, total: number): string {
  if (!total) return "—";
  return `${formatNumber((accepted / total) * 100)}%`;
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-base font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

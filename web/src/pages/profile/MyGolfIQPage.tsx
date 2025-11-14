import { useMemo, useState } from "react";
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

export default function MyGolfIQPage() {
  const { t } = useTranslation();
  const [rounds] = useState(() => loadAllRoundsFull());
  const [ghosts] = useState(() => listGhosts());
  const [bag] = useState(() => loadBag());

  const quickRoundStats = useMemo(() => computeQuickRoundStats(rounds), [rounds]);
  const rangeStats = useMemo(() => computeRangeSummary(ghosts), [ghosts]);
  const bagStats = useMemo(() => computeBagSummary(bag), [bag]);

  const recentRounds = useMemo(() => {
    return [...rounds]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 5);
  }, [rounds]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">{t("profile.title")}</h1>
        <p className="mt-1 text-sm text-slate-400">{t("profile.subtitle")}</p>
      </div>

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
              {typeof quickRoundStats.avgToPar === "number" && (
                <StatBlock
                  label={t("profile.quickRounds.avgToPar")}
                  value={formatToPar(quickRoundStats.avgToPar)}
                />
              )}
              {typeof quickRoundStats.bestToPar === "number" && (
                <StatBlock
                  label={t("profile.quickRounds.bestToPar")}
                  value={formatToPar(quickRoundStats.bestToPar)}
                />
              )}
            </dl>

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

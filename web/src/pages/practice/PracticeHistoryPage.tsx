import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  buildPracticeHistoryList,
  type PracticeHistoryListItem,
} from "@shared/practice/practiceHistory";
import {
  PRACTICE_MISSION_WINDOW_DAYS,
  loadPracticeMissionHistory,
} from "@/practice/practiceMissionHistory";
import { loadBag } from "@/bag/storage";
import type { BagState } from "@/bag/types";

function formatDate(value: string, locale: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(locale || undefined, { month: "short", day: "numeric" });
}

function StatusBadge({ status }: { status: PracticeHistoryListItem["status"] }): JSX.Element {
  const { t } = useTranslation();
  const labelKey =
    status === "completed"
      ? "practice.history.status.completed"
      : status === "partial"
        ? "practice.history.status.partial"
        : "practice.history.status.incomplete";
  const classes =
    status === "completed"
      ? "bg-emerald-500/10 text-emerald-200 border-emerald-400/40"
      : status === "partial"
        ? "bg-amber-500/10 text-amber-200 border-amber-400/40"
        : "bg-slate-800 text-slate-200 border-slate-600/60";

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}>
      {t(labelKey)}
    </span>
  );
}

function PracticeHistoryRow({
  item,
  locale,
}: {
  item: PracticeHistoryListItem;
  locale: string;
}): JSX.Element {
  const { t } = useTranslation();
  const dateLabel = useMemo(() => formatDate(item.day, locale), [item.day, locale]);
  const clubsLabel = item.targetClubsLabel || t("practice.history.anyClub");
  const samplesLabel = item.targetSampleCount
    ? t("practice.history.samplesWithTarget", {
        completed: item.completedSampleCount,
        target: item.targetSampleCount,
      })
    : t("practice.history.samples", { completed: item.completedSampleCount });

  return (
    <Link
      to={`/practice/history/${item.id}`}
      className="flex flex-col gap-2 py-3 transition hover:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between"
      data-testid="practice-history-item"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-100">{dateLabel}</p>
          {item.countsTowardStreak ? (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
              {t("practice.history.streakTag")}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-slate-200">{clubsLabel}</p>
        <p className="text-xs text-slate-400">{samplesLabel}</p>
      </div>
      <StatusBadge status={item.status} />
    </Link>
  );
}

type HistoryState = {
  loading: boolean;
  items: PracticeHistoryListItem[];
};

export default function PracticeHistoryPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [bag] = useState<BagState>(() => loadBag());
  const [{ items, loading }, setState] = useState<HistoryState>({ loading: true, items: [] });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [history] = await Promise.all([loadPracticeMissionHistory()]);
        if (cancelled) return;

        const clubLabels = bag.clubs.reduce<Record<string, string>>((acc, club) => {
          acc[club.id] = club.label;
          return acc;
        }, {});

        const list = buildPracticeHistoryList(history, {
          daysBack: PRACTICE_MISSION_WINDOW_DAYS,
          limit: 20,
          clubLabels,
        });

        setState({ loading: false, items: list });
      } catch (err) {
        if (!cancelled) {
          console.warn("[practice] Failed to load history", err);
          setState({ loading: false, items: [] });
        }
      }
    };

    load().catch((err) => console.warn("[practice] history load crashed", err));
    return () => {
      cancelled = true;
    };
  }, [bag]);

  const locale = i18n.language || "en";

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/80">GolfIQ</p>
        <h1 className="text-2xl font-semibold text-slate-50">{t("practice.history.title")}</h1>
        <p className="text-sm text-slate-400">{t("practice.history.subtitle")}</p>
      </header>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
          {t("practice.history.loading")}
        </div>
      ) : items.length === 0 ? (
        <div
          className="space-y-3 rounded-xl border border-dashed border-slate-800 bg-slate-900/60 p-6"
          data-testid="practice-history-empty"
        >
          <h2 className="text-lg font-semibold text-slate-50">{t("practice.history.emptyTitle")}</h2>
          <p className="text-sm text-slate-400">{t("practice.history.emptyBody")}</p>
          <Link
            to="/range/practice"
            className="inline-flex w-full justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-400 sm:w-auto"
            data-testid="practice-history-start"
          >
            {t("practice.history.emptyCta")}
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4" data-testid="practice-history-list">
          <div className="divide-y divide-slate-800">
            {items.map((item) => (
              <PracticeHistoryRow key={item.id} item={item} locale={locale} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

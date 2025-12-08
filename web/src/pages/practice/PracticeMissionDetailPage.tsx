import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  buildPracticeMissionDetail,
  type PracticeMissionDetail,
} from "@shared/practice/practiceHistory";
import { loadPracticeMissionHistory } from "@/practice/practiceMissionHistory";
import { loadBag } from "@/bag/storage";
import type { BagState } from "@/bag/types";

function ProgressBar({ ratio }: { ratio: number | null }) {
  if (ratio == null) return null;
  const width = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className="h-2 w-full rounded-full bg-slate-800">
      <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${width}%` }} />
    </div>
  );
}

type DetailState = {
  loading: boolean;
  detail: PracticeMissionDetail | null;
};

export default function PracticeMissionDetailPage(): JSX.Element {
  const { t } = useTranslation();
  const params = useParams();
  const navigate = useNavigate();
  const [{ detail, loading }, setState] = useState<DetailState>({ loading: true, detail: null });
  const [bag] = useState<BagState>(() => loadBag());
  const entryId = params.id ?? null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const history = await loadPracticeMissionHistory();
        if (cancelled) return;

        const clubLabels = bag.clubs.reduce<Record<string, string>>((acc, club) => {
          acc[club.id] = club.label;
          return acc;
        }, {});

        const computed = entryId ? buildPracticeMissionDetail(history, entryId, { clubLabels }) : null;
        setState({ loading: false, detail: computed });
      } catch (err) {
        if (!cancelled) {
          console.warn("[practice] Failed to load mission detail", err);
          setState({ loading: false, detail: null });
        }
      }
    };

    load().catch((err) => console.warn("[practice] mission detail load crashed", err));
    return () => {
      cancelled = true;
    };
  }, [bag, entryId]);

  const repeatHref = useMemo(() => {
    if (!detail || detail.targetClubs.length === 0) return null;
    const club = detail.targetClubs[0]?.id ?? "";
    const target = detail.targetSampleCount ?? "";
    const params = new URLSearchParams();
    params.set("missionId", detail.missionId);
    if (club) params.set("club", club);
    if (target) params.set("targetSamples", String(target));
    return `/range/practice?${params.toString()}`;
  }, [detail]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-slate-200">
        {t("practice.history.loading")}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-slate-200">
        <h1 className="text-xl font-semibold text-slate-50">{t("practice.history.detail.title")}</h1>
        <p className="text-sm text-amber-200">{t("practice.history.detail.missing")}</p>
        <Link className="text-sm font-semibold text-emerald-300" to="/practice/history">
          {t("practice.history.viewLink")}
        </Link>
      </div>
    );
  }

  const targetLabel =
    detail.targetSampleCount != null
      ? t("practice.history.samplesWithTarget", {
          completed: detail.completedSampleCount,
          target: detail.targetSampleCount,
        })
      : t("practice.history.samples", { completed: detail.completedSampleCount });

  const streakCopy = detail.countedTowardStreak
    ? t("practice.history.detail.streakYes")
    : t("practice.history.detail.streakNo");

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/80">GolfIQ</p>
        <h1 className="text-2xl font-semibold text-slate-50">{t("practice.history.detail.title")}</h1>
        <p className="text-sm text-slate-400">{t("practice.history.subtitle")}</p>
      </header>

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">{t("practice.history.detail.startedAt")}</p>
            <p className="text-sm font-semibold text-slate-100">{detail.startedAt.toLocaleString()}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">{t("practice.history.detail.endedAt")}</p>
            <p className="text-sm font-semibold text-slate-100">
              {detail.endedAt ? detail.endedAt.toLocaleString() : t("practice.history.detail.unknown")}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">{t("practice.history.detail.clubs")}</p>
            <p className="text-sm font-semibold text-slate-100">
              {detail.targetClubs.length > 0
                ? detail.targetClubs.map((club) => club.label).join(", ")
                : t("practice.history.anyClub")}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">{t("practice.history.detail.samples")}</p>
            <p className="text-sm font-semibold text-slate-100">{targetLabel}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">{t("practice.history.detail.completion")}</p>
            <p className="text-sm font-semibold text-slate-100">
              {detail.completionRatio != null ? `${Math.round(detail.completionRatio * 100)}%` : "—"}
            </p>
          </div>
        </div>

        <ProgressBar ratio={detail.completionRatio} />

        <p className="text-sm font-semibold text-emerald-200">{streakCopy}</p>
      </div>

      {repeatHref ? (
        <button
          type="button"
          onClick={() => navigate(repeatHref)}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-400"
          data-testid="repeat-mission-button"
        >
          {t("practice.history.detail.repeatCta")}
        </button>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-300">
          {t("practice.history.detail.unrepeatable")}
        </div>
      )}
    </div>
  );
}

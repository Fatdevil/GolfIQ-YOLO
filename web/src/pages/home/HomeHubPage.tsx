import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { useUserAccess } from "@/access/UserAccessContext";
import { ProBadge } from "@/access/ProBadge";
import { BetaBadge } from "@/access/BetaBadge";
import { useCalibrationStatus } from "@/features/range/useCalibrationStatus";
import { useOnboarding } from "@/onboarding/useOnboarding";
import { seedDemoData } from "@/onboarding/demoSeed";
import { useNotifications } from "@/notifications/NotificationContext";

type ModeCardProps = {
  title: string;
  description: string;
  to: string;
  badge?: React.ReactNode;
};

const ModeCard: React.FC<ModeCardProps> = ({ title, description, to, badge }) => {
  const { t } = useTranslation();

  return (
    <Link
      to={to}
      className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 group-hover:text-sky-600">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        {badge}
      </div>
      <div className="mt-3 text-xs font-medium text-sky-600 group-hover:underline">{t("home.card.cta")}</div>
    </Link>
  );
};

export const HomeHubPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { plan, loading: accessLoading } = useUserAccess();
  const { status: calibStatus } = useCalibrationStatus();
  const { state: onboarding, markHomeSeen } = useOnboarding();
  const [seeding, setSeeding] = useState(false);
  const showOnboarding = !onboarding.homeSeen;
  const { notify } = useNotifications();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("home.title")}</h1>
          <p className="text-sm text-slate-400">{t("home.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">
            {accessLoading ? t("home.plan.loading") : t("home.plan.label", { plan })}
          </span>
          {plan === "pro" && <ProBadge />}
        </div>
      </header>

      {showOnboarding && (
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{t("onboarding.home.title")}</div>
              <p className="mt-1 text-xs text-sky-800">{t("onboarding.home.subtitle")}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                <li>{t("onboarding.home.point.quickRound")}</li>
                <li>{t("onboarding.home.point.range")}</li>
                <li>{t("onboarding.home.point.trip")}</li>
                <li>{t("onboarding.home.point.profile")}</li>
              </ul>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                className="inline-flex items-center rounded-md border border-sky-600 px-3 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-40"
                onClick={async () => {
                  setSeeding(true);
                  try {
                    await seedDemoData();
                    markHomeSeen();
                    notify("success", t("onboarding.home.demoDone"));
                    navigate("/profile");
                  } catch (error) {
                    console.error(error);
                    notify("error", t("onboarding.home.demoError"));
                  } finally {
                    setSeeding(false);
                  }
                }}
                disabled={seeding}
              >
                {seeding ? t("onboarding.home.demoSeeding") : t("onboarding.home.demoButton")}
              </button>
              <button
                type="button"
                className="text-xs text-sky-800 hover:underline"
                onClick={markHomeSeen}
              >
                {t("onboarding.home.dismiss")}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ModeCard
          to="/play"
          title={t("home.card.quickRound.title")}
          description={t("home.card.quickRound.description")}
        />
        <ModeCard
          to="/range/practice"
          title={t("home.card.range.title")}
          description={t("home.card.range.description")}
          badge={
            <div className="flex flex-col items-end gap-1">
              {calibStatus.calibrated ? (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {t("home.card.range.calibrated")}
                </span>
              ) : null}
              {plan === "pro" ? <ProBadge /> : null}
              <BetaBadge />
            </div>
          }
        />
        <ModeCard
          to="/trip/start"
          title={t("home.card.trip.title")}
          description={t("home.card.trip.description")}
          badge={<BetaBadge />}
        />
        <ModeCard
          to="/profile"
          title={t("home.card.profile.title")}
          description={t("home.card.profile.description")}
          badge={plan === "pro" ? <ProBadge /> : undefined}
        />
      </section>

      <footer className="mt-4 text-xs text-slate-500">
        <Link to="/settings" className="underline hover:text-slate-700">
          {t("settings.link")}
        </Link>
      </footer>
    </div>
  );
};

export default HomeHubPage;

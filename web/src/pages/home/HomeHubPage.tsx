import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { FeatureGate } from "@/access/FeatureGate";
import { UpgradeGate } from "@/access/UpgradeGate";
import { useAccessFeatures, useAccessPlan } from "@/access/UserAccessContext";
import {
  computeOnboardingChecklist,
  markHomeSeen,
  type OnboardingChecklist,
} from "@/onboarding/checklist";
import { seedDemoData } from "@/demo/demoData";
import { useNotifications } from "@/notifications/NotificationContext";

const Card: React.FC<{
  title: string;
  subtitle: string;
  action: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ title, subtitle, action, children, footer }) => (
  <div className="flex h-full flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
    <div className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        <p className="text-sm text-slate-400">{subtitle}</p>
      </div>
      {children}
    </div>
    <div className="mt-4 flex items-center justify-between gap-3">
      {footer}
      {action}
    </div>
  </div>
);

const GhostMatchBadge: React.FC = () => {
  const { hasPlanFeature } = useAccessFeatures();
  const { t } = useTranslation();

  const enabled = hasPlanFeature("RANGE_GHOSTMATCH");

  return (
    <FeatureGate feature="range.ghostMatch">
      {enabled ? (
        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
          {t("home.range.badge.ghostmatch")}
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
          {t("home.range.badge.ghostmatch")}
        </span>
      )}
    </FeatureGate>
  );
};

export const HomeHubPage: React.FC = () => {
  const { t } = useTranslation();
  const { plan, isPro } = useAccessPlan();
  const { notify } = useNotifications();
  const [checklist, setChecklist] = useState<OnboardingChecklist>(() =>
    computeOnboardingChecklist(),
  );

  useEffect(() => {
    markHomeSeen();
    setChecklist(computeOnboardingChecklist());
  }, []);

  const handleSeedDemo = async () => {
    await seedDemoData();
    setChecklist(computeOnboardingChecklist());
    notify("success", t("onboarding.seed.success"));
  };

  const effectivePlan = plan === "pro" ? "PRO" : "FREE";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-200/80">GolfIQ</div>
          <h1 className="text-2xl font-semibold text-slate-50">{t("home.header.title")}</h1>
          <p className="text-sm text-slate-400">{t("home.header.subtitle")}</p>
        </div>
        <div className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-100">
          <span className="font-semibold text-emerald-200">{t("app.title")}</span>
          <span className="ml-2 inline-flex items-center px-2 py-[2px] rounded-full border text-[10px] font-semibold">
            {effectivePlan === "PRO" ? t("access.plan.pro") : t("access.plan.free")}
          </span>
        </div>
      </header>

      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              {t("onboarding.title")}
            </h2>
            <p className="text-[11px] text-slate-400">
              {t("onboarding.subtitle")}
            </p>
          </div>
          {!checklist.allDone && (
            <button
              type="button"
              onClick={handleSeedDemo}
              data-testid="seed-demo-data"
              className="text-[11px] rounded border border-emerald-300/40 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-100 hover:bg-emerald-500/20"
            >
              {t("onboarding.seed.button")}
            </button>
          )}
        </header>

        <ul className="space-y-2 text-[11px]">
          {checklist.tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 text-slate-200">
              <span
                className={
                  "inline-flex h-3 w-3 rounded-full border " +
                  (task.done
                    ? "border-emerald-400 bg-emerald-500"
                    : "border-slate-500")
                }
              />
              <span
                className={
                  task.done ? "text-slate-400 line-through" : "text-slate-100"
                }
              >
                {t(task.labelKey)}
              </span>
            </li>
          ))}
        </ul>

        {checklist.allDone && (
          <p className="text-[11px] font-semibold text-emerald-200">
            {t("onboarding.allDone")}
          </p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          title={t("home.quick.title")}
          subtitle={t("home.quick.subtitle")}
          action={
            <Link
              to="/play"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-400"
            >
              {t("home.quick.button")}
            </Link>
          }
        >
          <div className="text-xs text-slate-400">
            <div className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-200">
              {t("home.quick.badge")}
            </div>
          </div>
        </Card>

        <Card
          title={t("home.range.title")}
          subtitle={t("home.range.subtitle")}
          action={
            <Link
              to="/range/practice"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-400"
            >
              {t("home.range.button")}
            </Link>
          }
          footer={
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-emerald-200">
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5">
                {t("home.range.badge.bingo")}
              </span>
              <GhostMatchBadge />
            </div>
          }
        />

        <Card
          title={t("home.profile.title")}
          subtitle={t("home.profile.subtitle")}
          action={
            <Link
              to="/profile"
              className="inline-flex items-center justify-center rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-white"
            >
              {t("home.profile.button")}
            </Link>
          }
          footer={<div className="text-xs text-slate-400">{t("home.profile.metricsPlaceholder")}</div>}
        />

        {isPro ? (
          <Card
            title={t("home.pro.title")}
            subtitle={t("home.pro.subtitle")}
            action={
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200">
                {t("access.plan.pro")}
              </div>
            }
          >
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-300">
              <li>{t("home.pro.unlocked.caddie")}</li>
              <li>{t("home.pro.unlocked.sg")}</li>
              <li>{t("home.pro.unlocked.range")}</li>
            </ul>
          </Card>
        ) : (
          <UpgradeGate feature="CADDIE_INSIGHTS">
            <Card
              title={t("home.pro.title")}
              subtitle={t("home.pro.subtitle")}
              action={
                <Link
                  to="/profile"
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-400"
                >
                  {t("home.pro.button")}
                </Link>
              }
            >
              <div className="space-y-1 text-xs text-slate-300">
                <div>• {t("home.pro.feature.caddie")}</div>
                <div>• {t("home.pro.feature.sg")}</div>
                <div>• {t("home.pro.feature.ghost")}</div>
              </div>
            </Card>
          </UpgradeGate>
        )}
      </div>
    </div>
  );
};

export default HomeHubPage;

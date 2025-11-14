import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useUserAccess } from "@/access/UserAccessContext";
import { ProBadge } from "@/access/ProBadge";

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
  const { plan, loading: accessLoading } = useUserAccess();

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
          badge={plan === "pro" ? <ProBadge /> : undefined}
        />
        <ModeCard
          to="/trip/start"
          title={t("home.card.trip.title")}
          description={t("home.card.trip.description")}
        />
        <ModeCard
          to="/profile"
          title={t("home.card.profile.title")}
          description={t("home.card.profile.description")}
          badge={plan === "pro" ? <ProBadge /> : undefined}
        />
      </section>
    </div>
  );
};

export default HomeHubPage;

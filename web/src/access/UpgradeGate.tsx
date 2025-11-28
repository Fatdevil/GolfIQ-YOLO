import React from "react";
import { useTranslation } from "react-i18next";

import { useAccessFeatures, useAccessPlan } from "./UserAccessContext";
import type { FeatureKey } from "./plan";
import { useDemoMode } from "@/demo/DemoContext";

type Props = {
  feature: FeatureKey;
  children: React.ReactNode;
};

export const UpgradeGate: React.FC<Props> = ({ feature, children }) => {
  const { hasPlanFeature } = useAccessFeatures();
  const { plan, loading, refresh } = useAccessPlan();
  const { demoMode } = useDemoMode();
  const { t } = useTranslation();

  const planLabel = plan?.toUpperCase?.() ?? plan;

  if (loading) {
    return <div className="text-xs text-slate-400">{t("access.loading")}</div>;
  }

  if (demoMode || hasPlanFeature(feature)) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="opacity-40 pointer-events-none select-none">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm text-center px-4">
        <div className="text-xs font-semibold mb-1">{t("access.upgrade.title")}</div>
        <div className="text-[11px] text-slate-600 mb-2">{t("access.upgrade.message")}</div>
        <button
          type="button"
          className="text-[11px] px-3 py-1 rounded bg-emerald-600 text-white font-semibold"
          onClick={refresh}
        >
          {t("access.upgrade.buttonLabel")}
        </button>
        <div className="mt-1 text-[10px] text-slate-500">
          {t("access.upgrade.planLabel", { plan: planLabel })}
        </div>
      </div>
    </div>
  );
};

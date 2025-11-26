import React from "react";
import { useTranslation } from "react-i18next";

import { usePlan } from "./PlanProvider";
import type { FeatureKey } from "./plan";

type Props = {
  feature: FeatureKey;
  children: React.ReactNode;
};

export const UpgradeGate: React.FC<Props> = ({ feature, children }) => {
  const { hasFeature, plan, setPlan } = usePlan();
  const { t } = useTranslation();

  if (hasFeature(feature)) {
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
          onClick={() => setPlan("PRO")}
        >
          {t("access.upgrade.buttonLabel")}
        </button>
        <div className="mt-1 text-[10px] text-slate-500">
          {t("access.upgrade.planLabel", { plan })}
        </div>
      </div>
    </div>
  );
};

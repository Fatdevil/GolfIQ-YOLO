import React from "react";
import { useTranslation } from "react-i18next";

import { useFeatureFlag } from "./UserAccessContext";
import { ProBadge } from "./ProBadge";
import type { FeatureId } from "./types";

type Props = {
  feature: FeatureId;
  children: React.ReactNode;
};

export const FeatureGate: React.FC<Props> = ({ feature, children }) => {
  const { enabled, loading } = useFeatureFlag(feature);
  const { t } = useTranslation();

  if (loading) {
    return <div className="text-xs text-slate-400">{t("access.loading")}</div>;
  }

  if (enabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
      <div className="mb-2 flex items-center justify-between">
        <span>{t("access.proOnlyFeature")}</span>
        <ProBadge />
      </div>
      <p className="mb-2">{t("access.upgradeTeaser")}</p>
      <button
        type="button"
        className="mt-1 inline-flex items-center rounded-md border border-yellow-500 px-3 py-1 text-xs font-semibold text-yellow-700 hover:bg-yellow-50"
      >
        {t("access.upgradeCta")}
      </button>
    </div>
  );
};

export default FeatureGate;

import type { ReactNode } from "react";

import { UserAccessContext } from "@/access/UserAccessContext";
import type { FeatureKey } from "@/access/plan";
import type { FeatureId, PlanName } from "@/access/types";

export type AccessOptions = {
  plan?: PlanName;
  loading?: boolean;
  allow?: FeatureId[] | ((feature: FeatureId) => boolean);
};

export function createAccessWrapper(options: AccessOptions = {}) {
  const { plan = "pro", loading = false, allow } = options;
  const hasFeature =
    typeof allow === "function"
      ? allow
      : (feature: FeatureId) => (Array.isArray(allow) ? allow.includes(feature) : true);

  const value = {
    plan,
    loading,
    hasFeature,
    hasPlanFeature: (_feature: FeatureKey) => (plan === "pro" ? true : hasFeature(_feature as FeatureId)),
    isPro: plan === "pro",
    isFree: plan === "free",
    refresh: async () => undefined,
    trial: null,
    expiresAt: null,
    error: undefined,
  };

  return function AccessWrapper({ children }: { children: ReactNode }) {
    return <UserAccessContext.Provider value={value}>{children}</UserAccessContext.Provider>;
  };
}

import type { ReactNode } from "react";

import { UserAccessContext } from "@/access/UserAccessContext";
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
  };

  return function AccessWrapper({ children }: { children: ReactNode }) {
    return <UserAccessContext.Provider value={value}>{children}</UserAccessContext.Provider>;
  };
}

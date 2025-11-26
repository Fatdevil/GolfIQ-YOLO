import React, { createContext, useContext, useEffect, useState } from "react";

import { DEFAULT_PLAN, type FeatureKey, type PlanId, isFeatureEnabled } from "./plan";

type PlanContextValue = {
  plan: PlanId;
  setPlan: (plan: PlanId) => void;
  hasFeature: (feature: FeatureKey) => boolean;
};

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

const STORAGE_KEY = "golfiq_plan_v1";

export const PlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [plan, setPlanState] = useState<PlanId>(DEFAULT_PLAN);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as PlanId | null;
      if (stored === "FREE" || stored === "PRO") {
        setPlanState(stored);
      }
    } catch {
      // ignore storage failures
    }
  }, []);

  const setPlan = (next: PlanId) => {
    setPlanState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage failures
    }
  };

  const value: PlanContextValue = {
    plan,
    setPlan,
    hasFeature: (feature: FeatureKey) => isFeatureEnabled(plan, feature),
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
};

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    throw new Error("usePlan must be used within PlanProvider");
  }
  return ctx;
}

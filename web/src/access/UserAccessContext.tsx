import axios from "axios";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import { API, withAuth } from "@/api";

import { FEATURE_MATRIX } from "./config";
import type { AccessPlan, FeatureId, PlanName } from "./types";

type FetchPlan = () => Promise<AccessPlan>;

type AccessState = {
  loading: boolean;
  plan: PlanName;
  hasFeature: (feature: FeatureId) => boolean;
};

type ProviderProps = {
  children: React.ReactNode;
  initialPlan?: PlanName;
  fetchPlan?: FetchPlan;
  autoFetch?: boolean;
};

const defaultFetchPlan: FetchPlan = async () => {
  const response = await axios.get<AccessPlan>(`${API}/api/access/plan`, {
    headers: withAuth(),
  });
  return response.data;
};

export const UserAccessContext = createContext<AccessState | undefined>(undefined);

export const UserAccessProvider: React.FC<ProviderProps> = ({
  children,
  initialPlan = "free",
  fetchPlan,
  autoFetch = true,
}) => {
  const [plan, setPlan] = useState<PlanName>(initialPlan);
  const [loading, setLoading] = useState<boolean>(autoFetch);
  const fetchPlanRef = useRef<FetchPlan | undefined>(fetchPlan);

  useEffect(() => {
    fetchPlanRef.current = fetchPlan;
  }, [fetchPlan]);

  useEffect(() => {
    if (!autoFetch) {
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        const planFetcher = fetchPlanRef.current ?? defaultFetchPlan;
        const data = await planFetcher();
        if (!active) {
          return;
        }
        if (data.plan === "free" || data.plan === "pro") {
          setPlan(data.plan);
        }
      } catch {
        // keep default plan
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [autoFetch]);

  const hasFeature = useMemo(() => {
    const enabled = new Set(FEATURE_MATRIX[plan] ?? []);
    return (feature: FeatureId) => enabled.has(feature);
  }, [plan]);

  const value = useMemo<AccessState>(
    () => ({
      loading,
      plan,
      hasFeature,
    }),
    [hasFeature, loading, plan],
  );

  return <UserAccessContext.Provider value={value}>{children}</UserAccessContext.Provider>;
};

export function useUserAccess(): AccessState {
  const ctx = useContext(UserAccessContext);
  if (!ctx) {
    throw new Error("useUserAccess must be used within UserAccessProvider");
  }
  return ctx;
}

export function useFeatureFlag(feature: FeatureId): { enabled: boolean; loading: boolean } {
  const { hasFeature, loading } = useUserAccess();
  return { enabled: hasFeature(feature), loading };
}

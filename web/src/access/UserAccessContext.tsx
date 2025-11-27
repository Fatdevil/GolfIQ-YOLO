import axios from "axios";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { API, withAuth } from "@/api";

import { FEATURE_MATRIX } from "./config";
import { DEFAULT_PLAN, type FeatureKey, type PlanId, isFeatureEnabled } from "./plan";
import type { AccessPlan, FeatureId, PlanName } from "./types";

type FetchPlan = () => Promise<AccessPlan>;

type AccessState = {
  loading: boolean;
  plan: PlanName;
  trial?: boolean | null;
  expiresAt?: string | null;
  hasFeature: (feature: FeatureId) => boolean;
  hasPlanFeature: (feature: FeatureKey) => boolean;
  isPro: boolean;
  isFree: boolean;
  refresh: () => Promise<void>;
  error?: Error;
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

const defaultAccessState: AccessState = {
  loading: false,
  plan: "free",
  trial: null,
  expiresAt: null,
  hasFeature: () => false,
  hasPlanFeature: () => false,
  isPro: false,
  isFree: true,
  refresh: async () => undefined,
};

export const UserAccessContext = createContext<AccessState>(defaultAccessState);

export const UserAccessProvider: React.FC<ProviderProps> = ({
  children,
  initialPlan = "free",
  fetchPlan,
  autoFetch = true,
}) => {
  const [plan, setPlan] = useState<PlanName>(initialPlan);
  const [trial, setTrial] = useState<boolean | null | undefined>(undefined);
  const [expiresAt, setExpiresAt] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(autoFetch);
  const [error, setError] = useState<Error | undefined>(undefined);
  const fetchPlanRef = useRef<FetchPlan | undefined>(fetchPlan);

  useEffect(() => {
    fetchPlanRef.current = fetchPlan;
  }, [fetchPlan]);

  const fetchPlanFromSource = useCallback(async (): Promise<AccessPlan> => {
    const planFetcher = fetchPlanRef.current ?? defaultFetchPlan;
    return planFetcher();
  }, []);

  const applyPlan = useCallback((data: AccessPlan): void => {
    if (data.plan === "free" || data.plan === "pro") {
      setPlan(data.plan);
      setTrial(data.trial ?? null);
      setExpiresAt(data.expires_at ?? null);
      setError(undefined);
    }
  }, []);

  useEffect(() => {
    if (!autoFetch) {
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        const data = await fetchPlanFromSource();
        if (!active) return;
        applyPlan(data);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err : new Error("Failed to fetch access plan"));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [applyPlan, autoFetch, fetchPlanFromSource]);

  const hasFeature = useMemo(() => {
    const enabled = new Set(FEATURE_MATRIX[plan] ?? []);
    return (feature: FeatureId) => enabled.has(feature);
  }, [plan]);

  const hasPlanFeature = useMemo(() => {
    const planId: PlanId = plan === "pro" ? "PRO" : DEFAULT_PLAN;
    return (feature: FeatureKey) => isFeatureEnabled(planId, feature);
  }, [plan]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPlanFromSource();
      applyPlan(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch access plan"));
    } finally {
      setLoading(false);
    }
  }, [applyPlan, fetchPlanFromSource]);

  const value = useMemo<AccessState>(
    () => ({
      loading,
      plan,
      trial,
      expiresAt,
      hasPlanFeature,
      isPro: plan === "pro",
      isFree: plan === "free",
      hasFeature,
      refresh,
      error,
    }),
    [error, expiresAt, hasFeature, hasPlanFeature, loading, plan, refresh, trial],
  );

  return <UserAccessContext.Provider value={value}>{children}</UserAccessContext.Provider>;
};

export function useUserAccess(): AccessState {
  return useContext(UserAccessContext);
}

export function useFeatureFlag(feature: FeatureId): { enabled: boolean; loading: boolean } {
  const { hasFeature, loading } = useUserAccess();
  return { enabled: hasFeature(feature), loading };
}

export function useAccessPlan() {
  const { plan, isFree, isPro, trial, expiresAt, loading, refresh, error } = useUserAccess();
  return { plan, isFree, isPro, trial, expiresAt, loading, refresh, error };
}

export function useAccessFeatures() {
  const { hasFeature, hasPlanFeature, loading } = useUserAccess();
  return { hasFeature, hasPlanFeature, loading };
}

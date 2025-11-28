import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const DEMO_MODE_KEY = "golfiq-demo-mode";

type DemoState = {
  demoMode: boolean;
  setDemoMode: (value: boolean) => void;
};

const defaultState: DemoState = {
  demoMode: false,
  setDemoMode: () => undefined,
};

export const DemoContext = createContext<DemoState>(defaultState);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [demoMode, setDemoMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(DEMO_MODE_KEY) === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(DEMO_MODE_KEY, demoMode ? "true" : "false");
  }, [demoMode]);

  const value = useMemo(() => ({ demoMode, setDemoMode }), [demoMode]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoMode(): DemoState {
  return useContext(DemoContext);
}

export const ONBOARDING_COMPLETED_KEY = "golfiq-onboarding-completed";

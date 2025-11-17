import { useState } from "react";
import { loadOnboardingState, saveOnboardingState, type OnboardingState } from "./state";

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(() => loadOnboardingState());

  const markHomeSeen = () => {
    const next = { ...state, homeSeen: true };
    saveOnboardingState(next);
    setState(next);
  };

  return { state, markHomeSeen };
}

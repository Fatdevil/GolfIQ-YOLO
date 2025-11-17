export type OnboardingState = {
  homeSeen: boolean;
};

const STORAGE_KEY = "golfiq.onboarding.v1";

export function loadOnboardingState(): OnboardingState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { homeSeen: false };
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return { homeSeen: !!parsed.homeSeen };
  } catch {
    return { homeSeen: false };
  }
}

export function saveOnboardingState(state: OnboardingState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

import { loadAllRounds } from "@/features/quickround/storage";
import { loadRangeSessions } from "@/features/range/sessions";
import { loadOnboardingState, saveOnboardingState } from "./state";

export type OnboardingTaskId =
  | "HOME_VISITED"
  | "PLAYED_RANGE"
  | "PLAYED_QUICKROUND"
  | "VIEWED_PROFILE";

export type OnboardingTask = {
  id: OnboardingTaskId;
  labelKey: string;
  done: boolean;
};

export type OnboardingChecklist = {
  tasks: OnboardingTask[];
  allDone: boolean;
};

const STORAGE_KEY = "golfiq_onboarding_v1.homeSeen";
const PROFILE_KEY = "golfiq_onboarding_v1.profileSeen";

function isHomeSeen(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) === "1";
    const legacyState = loadOnboardingState();
    return stored || legacyState.homeSeen;
  } catch {
    return false;
  }
}

export function isProfileSeen(): boolean {
  try {
    return window.localStorage.getItem(PROFILE_KEY) === "1";
  } catch {
    return false;
  }
}

export function computeOnboardingChecklist(): OnboardingChecklist {
  const rounds = loadAllRounds();
  const rangeSessions = loadRangeSessions();

  const homeSeen = isHomeSeen();
  const playedQuick = rounds.length > 0;
  const playedRange = rangeSessions.length > 0;
  const viewedProfile = isProfileSeen();

  const tasks: OnboardingTask[] = [
    {
      id: "HOME_VISITED",
      labelKey: "onboarding.task.home",
      done: homeSeen,
    },
    {
      id: "PLAYED_QUICKROUND",
      labelKey: "onboarding.task.quick",
      done: playedQuick,
    },
    {
      id: "PLAYED_RANGE",
      labelKey: "onboarding.task.range",
      done: playedRange,
    },
    {
      id: "VIEWED_PROFILE",
      labelKey: "onboarding.task.profile",
      done: viewedProfile,
    },
  ];

  const allDone = tasks.every((task) => task.done);

  return { tasks, allDone };
}

export function markHomeSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
    const legacyState = loadOnboardingState();
    saveOnboardingState({ ...legacyState, homeSeen: true });
  } catch {
    // ignore
  }
}

export function markProfileSeen(): void {
  try {
    window.localStorage.setItem(PROFILE_KEY, "1");
  } catch {
    // ignore
  }
}

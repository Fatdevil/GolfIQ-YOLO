import { apiFetch } from "@/api";

export type CoachCategory = "tee" | "approach" | "short" | "putt" | "sequence" | "strategy";

export type PlayerStrength = {
  category: CoachCategory;
  title: string;
  description?: string | null;
  evidence?: Record<string, unknown>;
};

export type PlayerWeakness = {
  category: CoachCategory;
  severity: "focus" | "critical";
  title: string;
  description?: string | null;
  evidence?: Record<string, unknown>;
};

export type DevelopmentStep = {
  week: number;
  title: string;
  description: string;
  focusCategory: CoachCategory;
  suggestedMissions?: string[];
};

export type PlayerModel = {
  playerType: string;
  style?: string | null;
  strengths: PlayerStrength[];
  weaknesses: PlayerWeakness[];
  consistencyScore?: number | null;
  developmentIndex?: number | null;
  referenceRunId?: string | null;
};

export type PlayerDevelopmentPlan = {
  focusCategories: CoachCategory[];
  steps: DevelopmentStep[];
};

export type PlayerProfile = {
  memberId: string;
  model: PlayerModel;
  plan: PlayerDevelopmentPlan;
};

export async function fetchPlayerProfile(): Promise<PlayerProfile> {
  const response = await apiFetch("/api/profile/player");
  if (!response.ok) {
    throw new Error(`failed_to_fetch_player_profile:${response.status}`);
  }
  return (await response.json()) as PlayerProfile;
}

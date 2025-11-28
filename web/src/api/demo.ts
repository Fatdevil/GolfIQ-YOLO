import { apiFetch } from "@/api";
import type { PlayerAnalytics } from "./analytics";
import type { CoachDiagnosis } from "./coachSummary";
import type { PlayerProfile } from "./profile";

export interface DemoProfileResponse {
  profile: PlayerProfile;
  analytics: PlayerAnalytics;
  diagnosis?: CoachDiagnosis | null;
}

export async function fetchDemoProfile(): Promise<DemoProfileResponse> {
  const res = await apiFetch("/api/demo/profile");
  if (!res.ok) throw new Error("Failed to load demo profile");
  return res.json();
}

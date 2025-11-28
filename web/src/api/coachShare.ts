import type { CoachRoundSummary } from "@/api/coachSummary";
import { apiFetch } from "@/api";

export type CoachShareResponse = {
  url: string;
  sid: string;
};

export type CoachSharePayload = {
  kind: string;
  run_id: string;
  summary?: CoachRoundSummary;
};

export async function createCoachShare(runId: string): Promise<CoachShareResponse> {
  const response = await apiFetch(`/api/coach/share/${encodeURIComponent(runId)}`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`failed_to_create_coach_share:${response.status}`);
  }

  return (await response.json()) as CoachShareResponse;
}

export async function fetchCoachSharePayload(sid: string): Promise<CoachSharePayload> {
  const response = await apiFetch(`/api/share/${encodeURIComponent(sid)}`);
  if (!response.ok) {
    throw new Error("not_found");
  }
  return (await response.json()) as CoachSharePayload;
}

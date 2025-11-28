import axios from "axios";

import { API, withAuth } from "@/api";

export type CoachSgCategory = {
  name: "tee" | "approach" | "short" | "putt";
  sg: number;
};

export type CoachHoleSg = {
  hole: number;
  gross_score: number;
  sg_total: number;
  worst_category?: string | null;
};

export type CoachSequenceSummary = {
  max_shoulder_rotation: number;
  max_hip_rotation: number;
  max_x_factor: number;
  sequence_order: string[];
  is_ideal: boolean;
};

export type CoachCaddieHighlight = {
  trusted_club?: string | null;
  trusted_club_trust_score?: number | null;
  ignored_club?: string | null;
  ignored_club_trust_score?: number | null;
};

export type CoachMissionSummary = {
  mission_id?: string | null;
  mission_label?: string | null;
  success?: boolean | null;
};

export type CoachRoundSummary = {
  run_id: string;
  member_id?: string | null;
  course_name?: string | null;
  tees?: string | null;
  date?: string | null;
  score?: number | null;
  sg_total?: number | null;
  sg_by_category: CoachSgCategory[];
  sg_per_hole: CoachHoleSg[];
  sequence?: CoachSequenceSummary | null;
  caddie?: CoachCaddieHighlight | null;
  mission?: CoachMissionSummary | null;
};

export async function fetchCoachRoundSummary(
  runId: string,
): Promise<CoachRoundSummary> {
  const response = await axios.get<CoachRoundSummary>(
    `${API}/api/coach/round-summary/${runId}`,
    { headers: withAuth() },
  );
  return response.data;
}

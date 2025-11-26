import axios from "axios";

import { API, withAuth } from "@/api";

export type SgCategory = "TEE" | "APPROACH" | "SHORT" | "PUTT";

export type HoleSgPreview = {
  hole: number;
  sg_by_cat: Record<SgCategory, number>;
};

export type RoundSgPreview = {
  runId: string;
  courseId: string | null;
  total_sg: number;
  sg_by_cat: Record<SgCategory, number>;
  holes: HoleSgPreview[];
};

export async function fetchSgPreview(runId: string): Promise<RoundSgPreview> {
  const response = await axios.get<RoundSgPreview>(`${API}/api/sg/run/${runId}`, {
    headers: withAuth(),
  });
  return response.data;
}


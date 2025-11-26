import { apiClient } from "@/api";
import type { SgCategory } from "./sgPreview";

export type MemberSgCategorySummary = {
  category: SgCategory;
  total_sg: number;
  avg_sg: number;
  rounds: number;
};

export type MemberSgSummary = {
  memberId: string;
  runIds: string[];
  total_sg: number;
  avg_sg_per_round: number;
  per_category: Record<SgCategory, MemberSgCategorySummary>;
};

export async function fetchMemberSgSummary(
  memberId: string,
  limit = 5,
): Promise<MemberSgSummary> {
  const resp = await apiClient.get<MemberSgSummary>(`/api/sg/member/${memberId}`, {
    params: { limit },
  });
  return resp.data;
}

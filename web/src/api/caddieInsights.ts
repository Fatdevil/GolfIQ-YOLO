import axios from "axios";

import { API, withAuth } from "@/api";

export type CaddieClubStats = {
  club: string;
  shown: number;
  accepted: number;
};

export type CaddieInsights = {
  memberId: string;
  from_ts: string;
  to_ts: string;
  advice_shown: number;
  advice_accepted: number;
  accept_rate: number | null;
  per_club: CaddieClubStats[];
};

export async function fetchCaddieInsights(
  memberId: string,
  windowDays = 30,
): Promise<CaddieInsights> {
  const response = await axios.get<CaddieInsights>(`${API}/api/caddie/insights`, {
    headers: withAuth(),
    params: { memberId, windowDays },
  });
  return response.data;
}

import { apiFetch } from "@/api";
import type { BagClubStatsMap } from "@shared/caddie/bagStats";

export async function fetchBagStats(): Promise<BagClubStatsMap> {
  const response = await apiFetch("/api/player/bag-stats");
  if (!response.ok) {
    throw new Error(`failed_to_fetch_bag_stats:${response.status}`);
  }
  return (await response.json()) as BagClubStatsMap;
}

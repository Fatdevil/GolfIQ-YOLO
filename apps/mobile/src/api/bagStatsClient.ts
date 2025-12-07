import { apiFetch } from '@app/api/client';
import type { BagClubStatsMap } from '@shared/caddie/bagStats';

export async function fetchBagStats(): Promise<BagClubStatsMap> {
  return apiFetch<BagClubStatsMap>('/api/player/bag-stats');
}

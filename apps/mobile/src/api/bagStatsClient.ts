import { apiFetch } from '@app/api/client';
import { isBagStatsFresh, loadCachedBagStats, saveBagStatsToCache } from '@app/storage/bagStatsStorage';
import type { BagClubStatsMap } from '@shared/caddie/bagStats';

export async function fetchBagStats(): Promise<BagClubStatsMap> {
  try {
    const payload = await apiFetch<BagClubStatsMap>('/api/player/bag-stats');
    saveBagStatsToCache(payload).catch((err) =>
      console.warn('[bagStats] Failed to cache bag stats', err),
    );
    return payload;
  } catch (err) {
    const cached = await loadCachedBagStats();
    if (cached && isBagStatsFresh(cached)) {
      console.warn('[bagStats] Using cached bag stats after fetch error', err);
      return cached.payload;
    }
    throw err;
  }
}

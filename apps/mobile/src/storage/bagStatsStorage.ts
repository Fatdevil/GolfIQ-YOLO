import type { BagClubStatsMap } from '@shared/caddie/bagStats';

import { getItem, setItem } from '@app/storage/asyncStorage';

export type CachedBagStats = {
  payload: BagClubStatsMap;
  fetchedAt: number;
};

export const BAG_STATS_STORAGE_KEY = 'bagStats:v1';
export const BAG_STATS_MAX_AGE_MS = 86_400_000; // 24h

export function isBagStatsFresh(cache: CachedBagStats, now = Date.now()): boolean {
  return now - cache.fetchedAt <= BAG_STATS_MAX_AGE_MS;
}

export async function loadCachedBagStats(): Promise<CachedBagStats | null> {
  const raw = await getItem(BAG_STATS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedBagStats;
    if (!parsed?.payload || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch (err) {
    console.warn('[bagStatsStorage] Failed to parse cache', err);
    return null;
  }
}

export async function saveBagStatsToCache(payload: BagClubStatsMap): Promise<void> {
  const cache: CachedBagStats = { payload, fetchedAt: Date.now() };
  try {
    await setItem(BAG_STATS_STORAGE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('[bagStatsStorage] Failed to persist bag stats', err);
  }
}

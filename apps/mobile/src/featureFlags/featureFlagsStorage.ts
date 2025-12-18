import type { FeatureFlagsPayload } from '@shared/featureFlags/types';
import { getItem, removeItem, setItem } from '@app/storage/asyncStorage';

export const FEATURE_FLAGS_CACHE_KEY = 'golfiq.featureFlags.v1';

export async function readCachedFeatureFlags(): Promise<FeatureFlagsPayload | null> {
  const raw = await getItem(FEATURE_FLAGS_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FeatureFlagsPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCachedFeatureFlags(payload: FeatureFlagsPayload): Promise<void> {
  try {
    await setItem(FEATURE_FLAGS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

export async function clearCachedFeatureFlags(): Promise<void> {
  try {
    await removeItem(FEATURE_FLAGS_CACHE_KEY);
  } catch {
    // ignore cache delete failures
  }
}

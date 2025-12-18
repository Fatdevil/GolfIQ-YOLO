import type { FeatureFlagsPayload } from '@shared/featureFlags/types';
import { getItem, removeItem, setItem } from '@app/storage/asyncStorage';

function featureFlagsCacheKey(userId?: string | null): string {
  const scope = userId ? `user:${userId}` : 'user:anon';
  return `golfiq.featureFlags.remote.rollout.v1:${scope}`;
}

export async function readCachedFeatureFlags(
  userId?: string | null,
): Promise<FeatureFlagsPayload | null> {
  const raw = await getItem(featureFlagsCacheKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FeatureFlagsPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCachedFeatureFlags(
  payload: FeatureFlagsPayload,
  userId?: string | null,
): Promise<void> {
  try {
    await setItem(featureFlagsCacheKey(userId), JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

export async function clearCachedFeatureFlags(userId?: string | null): Promise<void> {
  try {
    await removeItem(featureFlagsCacheKey(userId));
  } catch {
    // ignore cache delete failures
  }
}

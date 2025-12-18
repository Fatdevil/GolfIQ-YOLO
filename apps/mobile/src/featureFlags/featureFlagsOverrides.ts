import type { FeatureFlagName } from '@shared/featureFlags/types';
import { getItem, removeItem, setItem } from '@app/storage/asyncStorage';

export type LocalFeatureFlagOverrides = Partial<Record<FeatureFlagName, boolean>>;

const LOCAL_OVERRIDE_STORAGE_KEY = 'golfiq.flags.localOverrides.v1';

export async function loadLocalFlagOverrides(): Promise<LocalFeatureFlagOverrides> {
  const raw = await getItem(LOCAL_OVERRIDE_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as LocalFeatureFlagOverrides;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

export async function setLocalFlagOverride(
  flagName: FeatureFlagName,
  value: boolean,
): Promise<void> {
  const overrides = await loadLocalFlagOverrides();
  const next: LocalFeatureFlagOverrides = { ...overrides, [flagName]: value };
  try {
    await setItem(LOCAL_OVERRIDE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore persistence errors
  }
}

export async function clearLocalFlagOverrides(): Promise<void> {
  try {
    await removeItem(LOCAL_OVERRIDE_STORAGE_KEY);
  } catch {
    // ignore persistence errors
  }
}

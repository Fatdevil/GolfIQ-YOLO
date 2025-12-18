import type { FeatureFlagName, FeatureFlagsPayload, ResolvedFeatureFlag } from './types';

let remoteFlags: Partial<Record<FeatureFlagName, ResolvedFeatureFlag>> | null = null;

export function setRemoteFeatureFlags(payload: FeatureFlagsPayload | null): void {
  remoteFlags = payload?.flags ?? null;
}

export function setRemoteFeatureFlag(name: FeatureFlagName, flag: ResolvedFeatureFlag | null): void {
  if (!flag) {
    clearRemoteFeatureFlag(name);
    return;
  }
  if (!remoteFlags) {
    remoteFlags = {};
  }
  remoteFlags[name] = flag;
}

export function getRemoteFeatureFlag(name: FeatureFlagName): ResolvedFeatureFlag | null {
  return remoteFlags?.[name] ?? null;
}

export function clearRemoteFeatureFlag(name: FeatureFlagName): void {
  if (!remoteFlags) return;
  const { [name]: _removed, ...rest } = remoteFlags;
  remoteFlags = Object.keys(rest).length ? (rest as Partial<Record<FeatureFlagName, ResolvedFeatureFlag>>) : null;
}

export function resetRemoteFeatureFlags(): void {
  remoteFlags = null;
}

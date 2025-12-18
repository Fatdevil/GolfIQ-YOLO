import { apiFetch, ApiError } from '@app/api/client';
import { safeEmit } from '@app/telemetry';
import { isPracticeGrowthV1Enabled } from '@shared/featureFlags/practiceGrowthV1';
import { isRoundFlowV2Enabled } from '@shared/featureFlags/roundFlowV2';
import { setRemoteFeatureFlags } from '@shared/featureFlags/remote';
import type {
  FeatureFlagName,
  FeatureFlagsPayload,
  ResolvedFeatureFlag,
} from '@shared/featureFlags/types';

import { readCachedFeatureFlags, writeCachedFeatureFlags } from './featureFlagsStorage';

let exposureLogged = false;
let lastUserId: string | null = null;

function normalizeFlags(
  flags: Partial<Record<FeatureFlagName, ResolvedFeatureFlag>> | undefined,
  fallbackSource: string,
  overrideSource?: string,
): Partial<Record<FeatureFlagName, ResolvedFeatureFlag>> {
  if (!flags) return {};
  const entries = Object.entries(flags).filter(([, value]) => Boolean(value)) as [
    FeatureFlagName,
    ResolvedFeatureFlag,
  ][];
  return entries.reduce<Partial<Record<FeatureFlagName, ResolvedFeatureFlag>>>(
    (acc, [name, flag]) => {
      acc[name] = {
        ...flag,
        source: overrideSource ?? flag.source ?? fallbackSource,
      };
      return acc;
    },
    {},
  );
}

function normalizePayload(
  payload: FeatureFlagsPayload,
  fallbackSource: string,
  overrideSource?: string,
): FeatureFlagsPayload {
  return {
    ...payload,
    flags: normalizeFlags(payload.flags, fallbackSource, overrideSource),
  };
}

async function fetchRemoteFeatureFlags(userId?: string): Promise<FeatureFlagsPayload | null> {
  try {
    const headers = userId ? { 'x-user-id': userId } : undefined;
    return await apiFetch<FeatureFlagsPayload>('/api/feature-flags', { headers });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    return null;
  }
}

function resolveSource(
  payload: FeatureFlagsPayload | null,
  name: FeatureFlagName,
  fallbackSource: string,
): string {
  return payload?.flags?.[name]?.source ?? fallbackSource;
}

function logExposureOnce(payload: FeatureFlagsPayload | null, fallbackSource: string): void {
  if (exposureLogged) return;
  exposureLogged = true;

  const practiceSource = resolveSource(payload, 'practiceGrowthV1', fallbackSource);
  const roundSource = resolveSource(payload, 'roundFlowV2', fallbackSource);

  try {
    safeEmit('feature_flags_loaded', {
      practiceGrowthV1_enabled: isPracticeGrowthV1Enabled(),
      practiceGrowthV1_source: practiceSource,
      roundFlowV2_enabled: isRoundFlowV2Enabled(),
      roundFlowV2_source: roundSource,
      version: payload?.version ?? 0,
    });
  } catch {
    // ignore telemetry failures
  }
}

export async function loadFeatureFlags(options?: { userId?: string | null }): Promise<FeatureFlagsPayload | null> {
  const userId = options?.userId ?? null;

  if (userId !== lastUserId) {
    setRemoteFeatureFlags(null);
    lastUserId = userId;
  }

  const remote = await fetchRemoteFeatureFlags(userId ?? undefined);
  if (remote) {
    const normalized = normalizePayload(remote, 'rollout');
    setRemoteFeatureFlags(normalized);
    await writeCachedFeatureFlags(normalized, userId);
    logExposureOnce(normalized, 'rollout');
    return normalized;
  }

  const cached = await readCachedFeatureFlags(userId);
  if (cached) {
    const normalized = normalizePayload(cached, 'cache', 'cache');
    setRemoteFeatureFlags(normalized);
    logExposureOnce(normalized, 'cache');
    return normalized;
  }

  setRemoteFeatureFlags(null);
  logExposureOnce(null, 'env');
  return null;
}

export function __resetFeatureFlagsForTests(): void {
  exposureLogged = false;
  lastUserId = null;
  setRemoteFeatureFlags(null);
}

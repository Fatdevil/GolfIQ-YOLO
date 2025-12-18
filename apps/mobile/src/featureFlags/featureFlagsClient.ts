import { FEATURE_FLAG_TTL_MS } from '@app/featureFlags/constants';
import {
  loadLocalFlagOverrides,
  type LocalFeatureFlagOverrides,
} from '@app/featureFlags/featureFlagsOverrides';
import { apiFetch, ApiError } from '@app/api/client';
import { safeEmit } from '@app/telemetry';
import {
  getPracticeGrowthV1Fallback,
  isPracticeGrowthV1Enabled,
} from '@shared/featureFlags/practiceGrowthV1';
import { getRoundFlowV2Fallback, isRoundFlowV2Enabled } from '@shared/featureFlags/roundFlowV2';
import { setRemoteFeatureFlags } from '@shared/featureFlags/remote';
import type {
  FeatureFlagName,
  FeatureFlagsPayload,
  ResolvedFeatureFlag,
} from '@shared/featureFlags/types';

import { readCachedFeatureFlags, writeCachedFeatureFlags } from './featureFlagsStorage';

type FeatureFlagSource = 'remote' | 'cache' | 'env';

let exposureLogged = false;
let lastUserId: string | null = null;
const lastSuccessfulFetchByUser = new Map<string, number>();
const lastLoadedPayloadByUser = new Map<string, FeatureFlagsPayload>();
const lastLoadedSourceByUser = new Map<string, FeatureFlagSource>();

function featureFlagScopeKey(userId?: string | null): string {
  return userId ?? 'anon';
}

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

function resolveAppEnv(): string {
  const rawEnv =
    process.env.MOBILE_APP_ENV ??
    process.env.EXPO_PUBLIC_APP_ENV ??
    process.env.APP_ENV ??
    process.env.NODE_ENV ??
    'development';

  return String(rawEnv).toLowerCase();
}

export function areLocalOverridesEnabled(): boolean {
  const isDev = Boolean((globalThis as { __DEV__?: boolean }).__DEV__);
  if (isDev) return true;
  return resolveAppEnv() !== 'production';
}

function resolveDefaultFeatureFlags(): FeatureFlagsPayload {
  return {
    version: 0,
    flags: {
      practiceGrowthV1: {
        enabled: getPracticeGrowthV1Fallback(true),
        rolloutPct: 100,
        source: 'env',
      },
      roundFlowV2: {
        enabled: getRoundFlowV2Fallback(false),
        rolloutPct: 100,
        source: 'env',
      },
    },
  } satisfies FeatureFlagsPayload;
}

function applyLocalOverrides(
  payload: FeatureFlagsPayload,
  overrides: LocalFeatureFlagOverrides,
): FeatureFlagsPayload {
  if (!areLocalOverridesEnabled() || !overrides || Object.keys(overrides).length === 0) {
    return payload;
  }

  const overrideEntries = Object.entries(overrides) as [FeatureFlagName, boolean][];
  const nextFlags: Partial<Record<FeatureFlagName, ResolvedFeatureFlag>> = {
    ...payload.flags,
  };

  overrideEntries.forEach(([name, enabled]) => {
    const existing = payload.flags?.[name];
    nextFlags[name] = {
      enabled,
      rolloutPct: existing?.rolloutPct ?? 100,
      source: 'override',
    };
  });

  return {
    ...payload,
    flags: nextFlags,
  };
}

async function loadLocalOverridesIfEnabled(): Promise<LocalFeatureFlagOverrides> {
  if (!areLocalOverridesEnabled()) return {};
  return loadLocalFlagOverrides();
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

export function getLastSuccessfulFeatureFlagsFetchMs(
  userId?: string | null,
): number | null {
  const timestamp = lastSuccessfulFetchByUser.get(featureFlagScopeKey(userId));
  return timestamp ?? null;
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
  const scope = featureFlagScopeKey(userId);
  const localOverrides = await loadLocalOverridesIfEnabled();

  if (userId !== lastUserId) {
    setRemoteFeatureFlags(null);
    lastUserId = userId;
  }

  const remote = await fetchRemoteFeatureFlags(userId ?? undefined);
  if (remote) {
    const normalized = normalizePayload(remote, 'rollout');
    lastSuccessfulFetchByUser.set(featureFlagScopeKey(userId), Date.now());
    lastLoadedPayloadByUser.set(scope, normalized);
    lastLoadedSourceByUser.set(scope, 'remote');

    const effective = applyLocalOverrides(normalized, localOverrides);
    setRemoteFeatureFlags(effective);
    await writeCachedFeatureFlags(normalized, userId);
    logExposureOnce(effective, 'rollout');
    return effective;
  }

  const cached = await readCachedFeatureFlags(userId);
  if (cached) {
    const normalized = normalizePayload(cached, 'cache', 'cache');
    lastLoadedPayloadByUser.set(scope, normalized);
    lastLoadedSourceByUser.set(scope, 'cache');

    const effective = applyLocalOverrides(normalized, localOverrides);
    setRemoteFeatureFlags(effective);
    logExposureOnce(effective, 'cache');
    return effective;
  }

  const defaults = normalizePayload(resolveDefaultFeatureFlags(), 'env', 'env');
  lastLoadedPayloadByUser.set(scope, defaults);
  lastLoadedSourceByUser.set(scope, 'env');

  const effective = applyLocalOverrides(defaults, localOverrides);
  setRemoteFeatureFlags(effective);
  logExposureOnce(effective, 'env');
  return effective;
}

export function __resetFeatureFlagsForTests(): void {
  exposureLogged = false;
  lastUserId = null;
  lastSuccessfulFetchByUser.clear();
  lastLoadedPayloadByUser.clear();
  lastLoadedSourceByUser.clear();
  setRemoteFeatureFlags(null);
}

export type FeatureFlagsDebugState = {
  userId: string | null;
  remoteFlags: FeatureFlagsPayload | null;
  cachedFlags: FeatureFlagsPayload | null;
  effectiveFlags: FeatureFlagsPayload;
  localOverrides: LocalFeatureFlagOverrides;
  lastFetchAt: number | null;
  isFresh: boolean;
  source: FeatureFlagSource;
};

export async function getFeatureFlagsDebugState(options?: {
  userId?: string | null;
}): Promise<FeatureFlagsDebugState> {
  const userId = options?.userId ?? null;
  const scope = featureFlagScopeKey(userId);
  const localOverrides = await loadLocalOverridesIfEnabled();
  const cachedFlags = await readCachedFeatureFlags(userId);
  const lastPayload =
    lastLoadedPayloadByUser.get(scope) ?? normalizePayload(resolveDefaultFeatureFlags(), 'env', 'env');
  const source = lastLoadedSourceByUser.get(scope) ?? 'env';
  const effectiveFlags = applyLocalOverrides(lastPayload, localOverrides);
  const lastFetchAt = getLastSuccessfulFeatureFlagsFetchMs(userId);
  const isFresh = typeof lastFetchAt === 'number' ? Date.now() - lastFetchAt < FEATURE_FLAG_TTL_MS : false;

  return {
    userId,
    remoteFlags: source === 'remote' ? lastPayload : null,
    cachedFlags,
    effectiveFlags,
    localOverrides,
    lastFetchAt,
    isFresh,
    source,
  };
}

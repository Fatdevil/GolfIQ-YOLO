import { useEffect } from 'react';
import { AppState } from 'react-native';

import {
  getLastSuccessfulFeatureFlagsFetchMs,
  loadFeatureFlags,
} from '@app/featureFlags/featureFlagsClient';

export const DEFAULT_FEATURE_FLAG_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

type Props = {
  userId?: string | null;
  minIntervalMs?: number;
};

export function FeatureFlagsRefresher({
  userId = null,
  minIntervalMs = DEFAULT_FEATURE_FLAG_REFRESH_INTERVAL_MS,
}: Props): null {
  useEffect(() => {
    loadFeatureFlags({ userId }).catch(() => {
      // ignore failures; fall back to env/local flags
    });
  }, [userId]);

  useEffect(() => {
    const handleAppStateChange = (nextState: string) => {
      if (nextState !== 'active') return;

      const lastFetch = getLastSuccessfulFeatureFlagsFetchMs(userId);
      const now = Date.now();
      if (!lastFetch || now - lastFetch >= minIntervalMs) {
        loadFeatureFlags({ userId }).catch(() => {
          // ignore failures; fall back to env/local flags
        });
      }
    };

    if (!AppState?.addEventListener) return undefined;

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription?.remove?.();
    };
  }, [userId, minIntervalMs]);

  return null;
}

export default FeatureFlagsRefresher;

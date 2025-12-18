import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { FEATURE_FLAG_TTL_MS } from '@app/featureFlags/constants';
import {
  areLocalOverridesEnabled,
  getFeatureFlagsDebugState,
  loadFeatureFlags,
  type FeatureFlagsDebugState,
} from '@app/featureFlags/featureFlagsClient';
import { clearCachedFeatureFlags } from '@app/featureFlags/featureFlagsStorage';
import {
  clearLocalFlagOverrides,
  setLocalFlagOverride,
} from '@app/featureFlags/featureFlagsOverrides';
import type { RootStackParamList } from '@app/navigation/types';
import type { FeatureFlagName } from '@shared/featureFlags/types';

const FLAG_NAMES: FeatureFlagName[] = ['practiceGrowthV1', 'roundFlowV2'];

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return 'never';
  return new Date(timestamp).toLocaleString();
}

async function copyToClipboard(payload: Record<string, unknown>): Promise<void> {
  const serialized = JSON.stringify(payload, null, 2);
  try {
    const Clipboard = (await import('expo-clipboard')) as { setStringAsync?: (value: string) => Promise<void> };
    if (Clipboard && typeof Clipboard.setStringAsync === 'function') {
      await Clipboard.setStringAsync(serialized);
      return;
    }
  } catch {
    // fall through to navigator clipboard
  }

  const clipboardApi = (globalThis as {
    navigator?: { clipboard?: { writeText?: (value: string) => Promise<void> } };
  }).navigator?.clipboard;

  if (clipboardApi?.writeText) {
    await clipboardApi.writeText(serialized);
    return;
  }

  throw new Error('Clipboard unavailable in this runtime');
}

type Props = NativeStackScreenProps<RootStackParamList, 'FeatureFlagsDebug'>;

export default function FeatureFlagsDebugScreen({ route }: Props): JSX.Element {
  const userId = route.params?.userId ?? null;
  const [debugState, setDebugState] = useState<FeatureFlagsDebugState | null>(null);
  const [loading, setLoading] = useState(false);
  const overridesEnabled = useMemo(() => areLocalOverridesEnabled(), []);

  const loadDebugState = useCallback(async () => {
    setLoading(true);
    try {
      const state = await getFeatureFlagsDebugState({ userId });
      setDebugState(state);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadDebugState().catch(() => {
      Alert.alert('Failed to load flags');
    });
  }, [loadDebugState]);

  const handleRefresh = useCallback(async () => {
    try {
      await loadFeatureFlags({ userId });
      await loadDebugState();
    } catch {
      Alert.alert('Refresh failed', 'Could not fetch remote feature flags.');
    }
  }, [loadDebugState, userId]);

  const handleClearCache = useCallback(async () => {
    await clearCachedFeatureFlags(userId);
    await loadDebugState();
  }, [loadDebugState, userId]);

  const handleCopy = useCallback(async () => {
    if (!debugState) return;
    try {
      await copyToClipboard({
        userId: debugState.userId ?? 'anonymous',
        effectiveFlags: debugState.effectiveFlags.flags,
        lastFetchAt: debugState.lastFetchAt,
        source: debugState.source,
        isFresh: debugState.isFresh,
      });
      Alert.alert('Copied', 'Feature flag state copied to clipboard.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not copy flags.';
      Alert.alert('Copy failed', message);
    }
  }, [debugState]);

  const handleToggleOverride = useCallback(
    async (flagName: FeatureFlagName, value: boolean) => {
      if (!overridesEnabled) return;
      await setLocalFlagOverride(flagName, value);
      await loadDebugState();
    },
    [loadDebugState, overridesEnabled],
  );

  const handleResetOverrides = useCallback(async () => {
    await clearLocalFlagOverrides();
    await loadDebugState();
  }, [loadDebugState]);

  const freshnessLabel = useMemo(() => {
    if (!debugState) return 'unknown';
    return debugState.isFresh
      ? 'fresh (within TTL)'
      : `stale (> ${Math.floor(FEATURE_FLAG_TTL_MS / 60000)} min)`;
  }, [debugState]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Feature Flags Debug</Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>User:</Text>
        <Text>{userId ?? 'anonymous'}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Last fetch:</Text>
        <Text>{formatTimestamp(debugState?.lastFetchAt ?? null)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Freshness:</Text>
        <Text>
          {freshnessLabel} [{debugState?.source ?? 'env'}]
        </Text>
      </View>
      <View style={styles.buttonRow}>
        <View style={styles.buttonWrapper}>
          <Button title="Refresh now" onPress={handleRefresh} disabled={loading} testID="refresh-flags" />
        </View>
        <View style={styles.buttonWrapper}>
          <Button title="Clear cache" onPress={handleClearCache} disabled={loading} testID="clear-cache" />
        </View>
        <View style={styles.buttonWrapper}>
          <Button title="Copy JSON" onPress={handleCopy} disabled={loading || !debugState} testID="copy-flags" />
        </View>
      </View>

      {overridesEnabled ? (
        <View style={styles.overrideHeader}>
          <Text style={styles.sectionTitle}>Local overrides (dev only)</Text>
          <Button title="Reset overrides" onPress={handleResetOverrides} disabled={loading} testID="reset-overrides" />
        </View>
      ) : (
        <Text style={styles.infoText}>
          Overrides are disabled in production builds. Existing override values are read-only.
        </Text>
      )}

      <View style={styles.flagsContainer}>
        {FLAG_NAMES.map((name) => {
          const effective = debugState?.effectiveFlags.flags?.[name]?.enabled;
          const effectiveSource = debugState?.effectiveFlags.flags?.[name]?.source ?? 'unknown';
          const remote = debugState?.remoteFlags?.flags?.[name]?.enabled;
          const cached = debugState?.cachedFlags?.flags?.[name]?.enabled;
          const override = debugState?.localOverrides?.[name];

          return (
            <View key={name} style={styles.flagCard}>
              <Text style={styles.flagName}>{name}</Text>
              <Text style={styles.flagValue}>
                Effective: {String(effective)} ({effectiveSource})
              </Text>
              <Text style={styles.flagMeta}>Remote: {remote == null ? '—' : String(remote)}</Text>
              <Text style={styles.flagMeta}>Cached: {cached == null ? '—' : String(cached)}</Text>
              <Text style={styles.flagMeta}>Override: {override == null ? '—' : String(override)}</Text>
              <View style={styles.overrideRow}>
                <Text style={styles.flagMeta}>Toggle override</Text>
                <Switch
                  testID={`override-${name}`}
                  value={Boolean(override)}
                  onValueChange={(value) => handleToggleOverride(name, value)}
                  disabled={!overridesEnabled}
                />
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaLabel: {
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  buttonWrapper: {
    minWidth: 140,
  },
  overrideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  infoText: {
    color: '#666',
  },
  flagsContainer: {
    gap: 12,
  },
  flagCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fafafa',
  },
  flagName: {
    fontSize: 16,
    fontWeight: '700',
  },
  flagValue: {
    fontSize: 14,
    marginTop: 4,
  },
  flagMeta: {
    color: '#444',
  },
  overrideRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

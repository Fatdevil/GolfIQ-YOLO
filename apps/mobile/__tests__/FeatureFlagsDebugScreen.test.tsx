import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import FeatureFlagsDebugScreen from '@app/screens/FeatureFlagsDebugScreen';
import {
  areLocalOverridesEnabled,
  getFeatureFlagsDebugState,
  loadFeatureFlags,
  type FeatureFlagsDebugState,
} from '@app/featureFlags/featureFlagsClient';
import { clearCachedFeatureFlags } from '@app/featureFlags/featureFlagsStorage';
import { setLocalFlagOverride } from '@app/featureFlags/featureFlagsOverrides';

vi.mock('expo-clipboard', () => ({
  setStringAsync: vi.fn(),
}));

vi.mock('@app/featureFlags/featureFlagsClient', () => ({
  areLocalOverridesEnabled: vi.fn(),
  getFeatureFlagsDebugState: vi.fn(),
  loadFeatureFlags: vi.fn(),
}));

vi.mock('@app/featureFlags/featureFlagsStorage', () => ({
  clearCachedFeatureFlags: vi.fn(),
}));

vi.mock('@app/featureFlags/featureFlagsOverrides', () => ({
  setLocalFlagOverride: vi.fn(),
}));

const baseState: FeatureFlagsDebugState = {
  userId: 'user-123',
  remoteFlags: {
    version: 1,
    flags: {
      practiceGrowthV1: { enabled: true, rolloutPct: 50, source: 'rollout' },
      roundFlowV2: { enabled: false, rolloutPct: 0, source: 'rollout' },
    },
  },
  cachedFlags: null,
  effectiveFlags: {
    version: 1,
    flags: {
      practiceGrowthV1: { enabled: true, rolloutPct: 50, source: 'rollout' },
      roundFlowV2: { enabled: false, rolloutPct: 0, source: 'rollout' },
    },
  },
  localOverrides: {},
  lastFetchAt: 1700000000000,
  isFresh: true,
  source: 'remote',
};

const defaultRoute = { key: 'FeatureFlagsDebug', name: 'FeatureFlagsDebug', params: { userId: 'user-123' } } as const;
const navigation = { navigate: vi.fn() } as any;

describe('FeatureFlagsDebugScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getFeatureFlagsDebugState).mockResolvedValue(baseState);
    vi.mocked(areLocalOverridesEnabled).mockReturnValue(true);
  });

  it('renders effective flags and metadata', async () => {
    render(<FeatureFlagsDebugScreen navigation={navigation} route={defaultRoute} />);

    expect(await screen.findByText('Feature Flags Debug')).toBeTruthy();
    expect(screen.getByText('user-123')).toBeTruthy();
    expect(screen.getByText('practiceGrowthV1')).toBeTruthy();
    expect(screen.getByText(/Effective: true/)).toBeTruthy();
  });

  it('refreshes flags on demand', async () => {
    render(<FeatureFlagsDebugScreen navigation={navigation} route={defaultRoute} />);

    fireEvent.click(await screen.findByTestId('refresh-flags'));

    await waitFor(() => expect(loadFeatureFlags).toHaveBeenCalledWith({ userId: 'user-123' }));
  });

  it('clears cached flags for the user', async () => {
    render(<FeatureFlagsDebugScreen navigation={navigation} route={defaultRoute} />);

    fireEvent.click(await screen.findByTestId('clear-cache'));

    await waitFor(() => expect(clearCachedFeatureFlags).toHaveBeenCalledWith('user-123'));
  });

  it('toggles overrides in dev mode', async () => {
    vi.mocked(getFeatureFlagsDebugState)
      .mockResolvedValueOnce(baseState)
      .mockResolvedValueOnce({
        ...baseState,
        localOverrides: { practiceGrowthV1: true },
        effectiveFlags: {
          ...baseState.effectiveFlags,
          flags: {
            ...baseState.effectiveFlags.flags,
            practiceGrowthV1: { enabled: true, rolloutPct: 100, source: 'override' },
          },
        },
      });

    render(<FeatureFlagsDebugScreen navigation={navigation} route={defaultRoute} />);

    fireEvent.click(await screen.findByTestId('override-practiceGrowthV1'));

    await waitFor(() => expect(setLocalFlagOverride).toHaveBeenCalledWith('practiceGrowthV1', true));
    expect(await screen.findByText(/Effective: true/)).toBeTruthy();
  });

  it('copies flag json to clipboard', async () => {
    const { setStringAsync } = await import('expo-clipboard');
    render(<FeatureFlagsDebugScreen navigation={navigation} route={defaultRoute} />);

    fireEvent.click(await screen.findByTestId('copy-flags'));

    await waitFor(() => expect(setStringAsync).toHaveBeenCalled());
  });
});

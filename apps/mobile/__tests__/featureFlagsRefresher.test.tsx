import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, SpyInstance } from 'vitest';

import {
  FeatureFlagsRefresher,
  DEFAULT_FEATURE_FLAG_REFRESH_INTERVAL_MS,
} from '@app/featureFlags/FeatureFlagsRefresher';
import { loadFeatureFlags, getLastSuccessfulFeatureFlagsFetchMs } from '@app/featureFlags/featureFlagsClient';
import { AppState } from 'react-native';

vi.mock('@app/featureFlags/featureFlagsClient', () => ({
  loadFeatureFlags: vi.fn().mockResolvedValue(null),
  getLastSuccessfulFeatureFlagsFetchMs: vi.fn(),
}));

vi.mock('react-native', () => {
  const listeners = new Set<(state: string) => void>();
  return {
    AppState: {
      addEventListener: (_type: string, listener: (state: string) => void) => {
        listeners.add(listener);
        return {
          remove: () => listeners.delete(listener),
        };
      },
      __emit: (state: string) => {
        listeners.forEach((listener) => listener(state));
      },
    },
  };
});

type MockedAppState = typeof AppState & { __emit: (state: string) => void };
const mockedAppState = AppState as MockedAppState;
const mockedLoadFeatureFlags = loadFeatureFlags as unknown as Mock;
const mockedGetLastFetch = getLastSuccessfulFeatureFlagsFetchMs as unknown as Mock;

describe('FeatureFlagsRefresher', () => {
  let nowSpy: SpyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedLoadFeatureFlags.mockResolvedValue(null);
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T00:00:00Z').getTime());
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('loads feature flags on mount for the current user', async () => {
    mockedGetLastFetch.mockReturnValue(null);

    render(<FeatureFlagsRefresher userId="user-a" />);

    await waitFor(() => expect(mockedLoadFeatureFlags).toHaveBeenCalledTimes(1));
    expect(mockedLoadFeatureFlags).toHaveBeenCalledWith({ userId: 'user-a' });
  });

  it('refreshes when returning to the foreground after the TTL elapses', async () => {
    mockedGetLastFetch.mockReturnValue(0);

    render(<FeatureFlagsRefresher minIntervalMs={DEFAULT_FEATURE_FLAG_REFRESH_INTERVAL_MS} />);

    nowSpy.mockReturnValue(DEFAULT_FEATURE_FLAG_REFRESH_INTERVAL_MS + 1);
    await act(async () => {
      mockedAppState.__emit('active');
    });

    await waitFor(() => expect(mockedLoadFeatureFlags).toHaveBeenCalledTimes(2));
  });

  it('does not refetch when the last fetch is still fresh', async () => {
    mockedGetLastFetch.mockReturnValue(Date.now());

    render(<FeatureFlagsRefresher minIntervalMs={DEFAULT_FEATURE_FLAG_REFRESH_INTERVAL_MS} />);

    await act(async () => {
      mockedAppState.__emit('active');
    });

    await waitFor(() => expect(mockedLoadFeatureFlags).toHaveBeenCalledTimes(1));
  });

  it('refreshes immediately when the user id changes', async () => {
    const lastFetchByUser: Record<string, number | undefined> = { 'user-a': Date.now() };
    mockedGetLastFetch.mockImplementation((userId?: string | null) => {
      return userId ? lastFetchByUser[userId] ?? null : null;
    });

    const { rerender } = render(<FeatureFlagsRefresher userId="user-a" />);

    await waitFor(() => expect(mockedLoadFeatureFlags).toHaveBeenCalledTimes(1));

    rerender(<FeatureFlagsRefresher userId="user-b" />);

    await waitFor(() => expect(mockedLoadFeatureFlags).toHaveBeenCalledTimes(2));

    await act(async () => {
      mockedAppState.__emit('active');
    });

    await waitFor(() => expect(mockedLoadFeatureFlags).toHaveBeenCalledTimes(3));
    expect(mockedLoadFeatureFlags).toHaveBeenLastCalledWith({ userId: 'user-b' });
  });
});

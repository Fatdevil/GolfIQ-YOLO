import { fireEvent, render, screen } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as playerApi from '@app/api/player';
import * as watchApi from '@app/api/watch';
import HomeScreen from '@app/screens/HomeScreen';
import * as rangeSummaryStorage from '@app/range/rangeSummaryStorage';
import type { RootStackParamList } from '@app/navigation/types';
import * as currentRun from '@app/run/currentRun';
import * as lastRound from '@app/run/lastRound';

vi.mock('@app/api/player', () => ({
  fetchPlayerProfile: vi.fn(),
  fetchAccessPlan: vi.fn(),
  fetchPlayerAnalytics: vi.fn(),
}));

vi.mock('@app/api/watch', () => ({
  fetchWatchStatus: vi.fn(),
  requestWatchPairCode: vi.fn(),
}));

vi.mock('@app/run/currentRun', () => ({
  loadCurrentRun: vi.fn(),
  clearCurrentRun: vi.fn(),
}));

vi.mock('@app/run/lastRound', () => ({
  loadLastRoundSummary: vi.fn(),
}));

vi.mock('@app/range/rangeSummaryStorage', () => ({
  loadLastRangeSessionSummary: vi.fn(),
}));

type Props = NativeStackScreenProps<RootStackParamList, 'PlayerHome'>;

type Navigation = Props['navigation'];

type Route = Props['route'];

function createNavigation(): Navigation {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as unknown as Navigation;
}

function createRoute(): Route {
  return { key: 'PlayerHome', name: 'PlayerHome' } as Route;
}

describe('HomeScreen range card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(playerApi.fetchPlayerProfile).mockResolvedValue({
      memberId: 'abc123',
      name: 'Ada',
      model: { playerType: 'balanced', style: null, strengths: [], weaknesses: [] },
      plan: { focusCategories: [], steps: [] },
    });
    vi.mocked(playerApi.fetchAccessPlan).mockResolvedValue({ plan: 'free' });
    vi.mocked(currentRun.loadCurrentRun).mockResolvedValue(null);
    vi.mocked(lastRound.loadLastRoundSummary).mockResolvedValue(null);
    vi.mocked(watchApi.fetchWatchStatus).mockResolvedValue({ paired: false, lastSeenAt: null });
    vi.mocked(watchApi.requestWatchPairCode).mockResolvedValue({
      code: '123456',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  it('renders an empty range state', async () => {
    vi.mocked(rangeSummaryStorage.loadLastRangeSessionSummary).mockResolvedValue(null);
    const navigation = createNavigation();

    render(<HomeScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('range-home-card')).toBeInTheDocument();
    expect(screen.getByTestId('range-last-session-label').textContent).toContain(
      'No recent range session',
    );
  });

  it('shows the last range summary when available', async () => {
    vi.mocked(rangeSummaryStorage.loadLastRangeSessionSummary).mockResolvedValue({
      id: 'range-1',
      startedAt: '2024-01-01T00:00:00.000Z',
      finishedAt: '2024-01-01T00:30:00.000Z',
      club: '7i',
      targetDistanceM: null,
      shotCount: 18,
    });
    const navigation = createNavigation();

    render(<HomeScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('range-last-session-label')).toHaveTextContent(
      'Last: 7i · 18 shots',
    );
  });

  it('navigates to range hub on press', async () => {
    vi.mocked(rangeSummaryStorage.loadLastRangeSessionSummary).mockResolvedValue(null);
    const navigation = createNavigation();

    render(<HomeScreen navigation={navigation} route={createRoute()} />);

    fireEvent.click(await screen.findByTestId('range-home-cta'));

    expect(navigation.navigate).toHaveBeenCalledWith('RangePractice');
  });
});

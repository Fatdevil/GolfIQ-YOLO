import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HomeScreen from '@app/screens/HomeScreen';
import type { RootStackParamList } from '@app/navigation/types';
import * as playerApi from '@app/api/player';
import * as watchApi from '@app/api/watch';
import * as currentRun from '@app/run/currentRun';

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

type Props = NativeStackScreenProps<RootStackParamList, 'PlayerHome'>;

type Navigation = Props['navigation'];

type Route = Props['route'];

const mockProfile: playerApi.PlayerProfile = {
  memberId: 'abc123',
  name: 'Ada',
  model: {
    playerType: 'balanced',
    style: null,
    strengths: [],
    weaknesses: [],
  },
  plan: { focusCategories: [], steps: [] },
};

const mockAnalytics: playerApi.PlayerAnalytics = {
  memberId: 'abc123',
  sgTrend: [
    {
      runId: 'run-1',
      date: new Date().toISOString(),
      sgTotal: 1.5,
      sgTee: 0.2,
      sgApproach: 0.3,
      sgShort: 0.5,
      sgPutt: 0.5,
    },
  ],
  categoryStatus: [],
  missionStats: { totalMissions: 0, completed: 0, completionRate: 0 },
  bestRoundId: 'run-1',
  worstRoundId: 'run-1',
};

function createNavigation(): Navigation {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as unknown as Navigation;
}

function createRoute(): Route {
  return {
    key: 'PlayerHome',
    name: 'PlayerHome',
  } as Route;
}

describe('HomeScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(watchApi.fetchWatchStatus).mockResolvedValue({ paired: false, lastSeenAt: null });
    vi.mocked(watchApi.requestWatchPairCode).mockResolvedValue({
      code: '123456',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.mocked(currentRun.loadCurrentRun).mockResolvedValue(null);
    vi.mocked(currentRun.clearCurrentRun).mockResolvedValue();
  });

  it('renders greeting, plan badge, and CTAs', async () => {
    vi.mocked(playerApi.fetchPlayerProfile).mockResolvedValue(mockProfile);
    vi.mocked(playerApi.fetchAccessPlan).mockResolvedValue({ plan: 'pro', trial: false });
    vi.mocked(playerApi.fetchPlayerAnalytics).mockResolvedValue(mockAnalytics);
    vi.mocked(watchApi.fetchWatchStatus).mockResolvedValue({
      paired: true,
      lastSeenAt: new Date().toISOString(),
    });
    const navigation = createNavigation();

    render(<HomeScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('home-greeting')).toHaveTextContent('Hi, Ada');
    expect(screen.getByTestId('plan-badge').textContent).toContain('Pro');
    expect(screen.getByTestId('play-round-cta')).toBeInTheDocument();
    expect(screen.getByTestId('range-cta')).toBeInTheDocument();
    expect(screen.getByTestId('trips-cta')).toBeInTheDocument();
    expect(screen.getByTestId('last-round-summary')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('watch-status-label').textContent).toContain('Connected');
    });
  });

  it('navigates to caddie setup from the CTA', async () => {
    vi.mocked(playerApi.fetchPlayerProfile).mockResolvedValue(mockProfile);
    vi.mocked(playerApi.fetchAccessPlan).mockResolvedValue({ plan: 'free' });
    const navigation = createNavigation();

    render(<HomeScreen navigation={navigation} route={createRoute()} />);

    fireEvent.click(await screen.findByTestId('caddie-setup-cta'));

    expect(navigation.navigate).toHaveBeenCalledWith('CaddieSetup');
  });

  it('shows error state and retries', async () => {
    vi.mocked(playerApi.fetchPlayerProfile).mockRejectedValueOnce(new Error('profile down'));
    vi.mocked(playerApi.fetchPlayerProfile).mockResolvedValueOnce(mockProfile);
    vi.mocked(playerApi.fetchAccessPlan).mockResolvedValue({ plan: 'free' });
    const navigation = createNavigation();

    render(<HomeScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('home-error')).toHaveTextContent('profile down');

    fireEvent.click(screen.getByTestId('home-retry'));

    await waitFor(() => {
      expect(screen.getByTestId('home-greeting')).toHaveTextContent('Hi, Ada');
    });
  });

  it('handles missing analytics with friendly copy', async () => {
    vi.mocked(playerApi.fetchPlayerProfile).mockResolvedValue(mockProfile);
    vi.mocked(playerApi.fetchAccessPlan).mockResolvedValue({ plan: 'free' });
    const navigation = createNavigation();

    render(<HomeScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('home-greeting')).toBeInTheDocument();
    expect(screen.getByTestId('empty-last-round')).toHaveTextContent('No rounds logged yet');
    expect(playerApi.fetchPlayerAnalytics).not.toHaveBeenCalled();
  });

  it('navigates to round history from the CTA', async () => {
    vi.mocked(playerApi.fetchPlayerProfile).mockResolvedValue(mockProfile);
    vi.mocked(playerApi.fetchAccessPlan).mockResolvedValue({ plan: 'free' });
    const navigation = createNavigation();

    render(<HomeScreen navigation={navigation} route={createRoute()} />);

    fireEvent.click(await screen.findByTestId('round-history-cta'));

    expect(navigation.navigate).toHaveBeenCalledWith('RoundHistory');
  });

  it('navigates to player stats from the CTA', async () => {
    vi.mocked(playerApi.fetchPlayerProfile).mockResolvedValue(mockProfile);
    vi.mocked(playerApi.fetchAccessPlan).mockResolvedValue({ plan: 'free' });
    const navigation = createNavigation();

    render(<HomeScreen navigation={navigation} route={createRoute()} />);

    fireEvent.click(await screen.findByTestId('player-stats-cta'));

    expect(navigation.navigate).toHaveBeenCalledWith('PlayerStats');
  });

  it('renders resume card when a current run exists', async () => {
    const run: currentRun.CurrentRun = {
      schemaVersion: 1,
      courseId: 'c1',
      courseName: 'Pebble',
      teeId: 't1',
      teeName: 'Blue',
      holes: 18,
      startedAt: '2024-01-01T00:00:00.000Z',
      mode: 'strokeplay',
      currentHole: 5,
      scorecard: {},
    };
    vi.mocked(currentRun.loadCurrentRun).mockResolvedValue(run);
    vi.mocked(playerApi.fetchPlayerProfile).mockResolvedValue(mockProfile);
    vi.mocked(playerApi.fetchAccessPlan).mockResolvedValue({ plan: 'free' });

    render(<HomeScreen navigation={createNavigation()} route={createRoute()} />);

    expect(await screen.findByTestId('resume-round-card')).toBeInTheDocument();
    expect(screen.getByText(/Pågående runda/)).toBeInTheDocument();
    expect(screen.getByText(/Hål 5 av 18/)).toBeInTheDocument();
  });

  it('allows discarding a current run from the home screen', async () => {
    const run: currentRun.CurrentRun = {
      schemaVersion: 1,
      courseId: 'c1',
      courseName: 'Pebble',
      teeId: 't1',
      teeName: 'Blue',
      holes: 18,
      startedAt: '2024-01-01T00:00:00.000Z',
      mode: 'strokeplay',
      currentHole: 5,
      scorecard: {},
    };
    vi.mocked(currentRun.loadCurrentRun).mockResolvedValue(run);
    vi.mocked(playerApi.fetchPlayerProfile).mockResolvedValue(mockProfile);
    vi.mocked(playerApi.fetchAccessPlan).mockResolvedValue({ plan: 'free' });

    render(<HomeScreen navigation={createNavigation()} route={createRoute()} />);

    fireEvent.click(await screen.findByTestId('discard-round'));
    fireEvent.click(await screen.findByTestId('confirm-discard'));

    await waitFor(() => {
      expect(currentRun.clearCurrentRun).toHaveBeenCalled();
      expect(screen.queryByTestId('resume-round-card')).not.toBeInTheDocument();
    });
  });
});

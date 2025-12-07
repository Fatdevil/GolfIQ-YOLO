import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as bagClient from '@app/api/bagClient';
import * as bagStatsClient from '@app/api/bagStatsClient';
import * as playerApi from '@app/api/player';
import * as practiceClient from '@app/api/practiceClient';
import * as roundClient from '@app/api/roundClient';
import * as weeklyApi from '@app/api/weeklySummary';
import type { RootStackParamList } from '@app/navigation/types';
import HomeDashboardScreen from '@app/screens/HomeDashboardScreen';
import * as engagementStorage from '@app/storage/engagement';
import type { BagClubStatsMap } from '@shared/caddie/bagStats';

type Props = NativeStackScreenProps<RootStackParamList, 'HomeDashboard'>;

type Navigation = Props['navigation'];

type Route = Props['route'];

const mockProfile: playerApi.PlayerProfile = {
  memberId: 'player-1',
  name: 'Sam',
  model: { playerType: 'balanced', style: null, strengths: [], weaknesses: [] },
  plan: { focusCategories: [], steps: [] },
};

const mockWeekly: weeklyApi.WeeklySummary = {
  period: { from: '2024-01-01', to: '2024-01-07', roundCount: 4 },
  headline: { text: 'Nice work', emoji: '🔥' },
  coreStats: { avgScore: 82, bestScore: 78, worstScore: 88, avgToPar: '+10', holesPlayed: 72 },
  categories: {},
  focusHints: [],
  strokesGained: undefined,
};

const mockPracticePlan: practiceClient.PracticePlan = {
  focusCategories: ['driving'],
  drills: [
    { id: 'd1', name: 'Fairway finder', description: '', category: 'driving', focusMetric: '', difficulty: 'easy', durationMinutes: 10 },
    { id: 'd2', name: 'Lag putts', description: '', category: 'putting', focusMetric: '', difficulty: 'easy', durationMinutes: 10 },
  ],
};

const mockBag: bagClient.PlayerBag = {
  clubs: [
    { clubId: '7i', label: '7i', avgCarryM: null, sampleCount: 6, active: true },
    { clubId: '5w', label: '5w', avgCarryM: null, sampleCount: 2, active: true },
  ],
};

const mockBagStats: BagClubStatsMap = {
  '7i': { clubId: '7i', meanDistanceM: 150, sampleCount: 6 },
  '5w': { clubId: '5w', meanDistanceM: 190, sampleCount: 2 },
};

function createNavigation(): Navigation {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as unknown as Navigation;
}

function createRoute(): Route {
  return { key: 'HomeDashboard', name: 'HomeDashboard' } as Route;
}

vi.mock('@app/api/player', () => ({ fetchPlayerProfile: vi.fn() }));
vi.mock('@app/api/roundClient', () => ({
  fetchCurrentRound: vi.fn(),
  fetchLatestCompletedRound: vi.fn(),
}));
vi.mock('@app/api/weeklySummary', () => ({ fetchWeeklySummary: vi.fn() }));
vi.mock('@app/api/practiceClient', () => ({ fetchPracticePlan: vi.fn() }));
vi.mock('@app/api/bagClient', () => ({ fetchPlayerBag: vi.fn() }));
vi.mock('@app/api/bagStatsClient', () => ({ fetchBagStats: vi.fn() }));
vi.mock('@app/storage/engagement', () => ({
  loadEngagementState: vi.fn(),
  saveEngagementState: vi.fn(),
}));

describe('HomeDashboardScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(playerApi.fetchPlayerProfile).mockResolvedValue(mockProfile);
    vi.mocked(roundClient.fetchCurrentRound).mockResolvedValue(null);
    vi.mocked(roundClient.fetchLatestCompletedRound).mockResolvedValue(null);
    vi.mocked(weeklyApi.fetchWeeklySummary).mockResolvedValue(mockWeekly);
    vi.mocked(practiceClient.fetchPracticePlan).mockResolvedValue(mockPracticePlan);
    vi.mocked(bagClient.fetchPlayerBag).mockResolvedValue(mockBag);
    vi.mocked(bagStatsClient.fetchBagStats).mockResolvedValue(mockBagStats);
    vi.mocked(engagementStorage.loadEngagementState).mockResolvedValue({});
    vi.mocked(engagementStorage.saveEngagementState).mockResolvedValue();
  });

  it('renders active round CTA and resumes on tap', async () => {
    vi.mocked(roundClient.fetchCurrentRound).mockResolvedValue({
      id: 'round-1',
      courseId: 'course-1',
      courseName: 'Pebble Beach',
      teeName: 'Blue',
      holes: 18,
      startedAt: new Date().toISOString(),
      status: 'in_progress',
    } as roundClient.RoundInfo);
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    const resumeButton = await screen.findByTestId('resume-round');
    fireEvent.click(resumeButton);

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('RoundShot', { roundId: 'round-1' });
    });
  });

  it('shows last round snapshot when available', async () => {
    vi.mocked(roundClient.fetchLatestCompletedRound).mockResolvedValue({
      roundId: 'round-2',
      courseId: 'my-course',
      teeName: 'White',
      holes: 9,
      startedAt: '2024-01-01T00:00:00Z',
      endedAt: '2024-01-01T02:00:00Z',
      totalStrokes: 38,
      totalToPar: 1,
      holesPlayed: 9,
      playerId: 'player-1',
    });
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('last-round-course')).toHaveTextContent('my-course');
    fireEvent.click(screen.getByTestId('view-last-round'));
    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('RoundRecap', { roundId: 'round-2' });
    });
  });

  it('falls back gracefully when some requests fail', async () => {
    vi.mocked(weeklyApi.fetchWeeklySummary).mockRejectedValue(new Error('boom'));
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('start-round')).toBeVisible();
    expect(screen.getByTestId('practice-snippet')).toBeVisible();
    fireEvent.click(screen.getByTestId('open-practice'));
    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('PracticePlanner');
    });
  });

  it('shows a new weekly badge when summary is fresh', async () => {
    vi.mocked(engagementStorage.loadEngagementState).mockResolvedValue({
      lastSeenWeeklySummaryAt: '2023-12-31',
    });
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('weekly-badge')).toBeVisible();
  });

  it('hides weekly badge when already seen', async () => {
    vi.mocked(engagementStorage.loadEngagementState).mockResolvedValue({
      lastSeenWeeklySummaryAt: mockWeekly.period.to,
    });
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    await waitFor(() => {
      expect(screen.queryByTestId('weekly-badge')).toBeNull();
    });
  });

  it('shows coach badge for unseen latest round', async () => {
    vi.mocked(roundClient.fetchLatestCompletedRound).mockResolvedValue({
      roundId: 'new-round',
      playerId: 'player-1',
      courseId: 'course-1',
      teeName: 'Blue',
      holes: 18,
      startedAt: '2024-01-02T00:00:00Z',
      endedAt: '2024-01-02T01:00:00Z',
      holesPlayed: 18,
    } as roundClient.RoundSummaryWithRoundInfo);
    vi.mocked(engagementStorage.loadEngagementState).mockResolvedValue({
      lastSeenCoachReportRoundId: 'old-round',
    });
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('coach-badge')).toBeVisible();
  });

  it('marks weekly summary as seen when opening it', async () => {
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    const weeklyCta = await screen.findByTestId('open-weekly');
    fireEvent.click(weeklyCta);

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('WeeklySummary');
      expect(engagementStorage.saveEngagementState).toHaveBeenCalledWith({
        lastSeenWeeklySummaryAt: mockWeekly.period.to,
      });
    });
  });

  it('renders weekly progress copy', async () => {
    vi.mocked(weeklyApi.fetchWeeklySummary).mockResolvedValue({
      ...mockWeekly,
      period: { ...mockWeekly.period, roundCount: 2 },
    });
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('weekly-progress-text')).toHaveTextContent('2/3 rounds this week');
  });

  it('shows encouragement when no rounds this week', async () => {
    vi.mocked(weeklyApi.fetchWeeklySummary).mockResolvedValue({
      ...mockWeekly,
      period: { ...mockWeekly.period, roundCount: 0 },
    });
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('weekly-progress-text')).toHaveTextContent('Play your first round this week');
  });

  it('surfaces bag readiness with score and suggestion', async () => {
    vi.mocked(bagStatsClient.fetchBagStats).mockResolvedValue({
      '7i': { clubId: '7i', meanDistanceM: 150, sampleCount: 8 },
      '5w': { clubId: '5w', meanDistanceM: 205, sampleCount: 8 },
    });
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('home-bag-readiness')).toBeVisible();
    expect(screen.getByTestId('home-bag-readiness-score').textContent).toMatch(/\d{1,3}\/100/);
    expect(screen.getByTestId('home-bag-readiness-suggestion').textContent).toMatch(/Suggestion/);
  });

  it('shows a low readiness grade when stats are missing', async () => {
    vi.mocked(bagStatsClient.fetchBagStats).mockResolvedValue({});
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('home-bag-readiness')).toBeVisible();
    expect(screen.getByText(/Needs work/i)).toBeVisible();
  });

  it('avoids showing a perfect readiness score when the bag fails to load', async () => {
    vi.mocked(bagClient.fetchPlayerBag).mockRejectedValue(new Error('bag failed'));
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('home-bag-readiness')).toBeVisible();
    expect(screen.queryByTestId('home-bag-readiness-score')).toBeNull();
    expect(screen.getByText(/Unable to load your bag./i)).toBeVisible();
  });
});

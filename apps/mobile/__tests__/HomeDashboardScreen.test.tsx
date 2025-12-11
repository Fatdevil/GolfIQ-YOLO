import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock, type MockInstance } from 'vitest';

import * as bagClient from '@app/api/bagClient';
import * as bagStatsClient from '@app/api/bagStatsClient';
import * as playerApi from '@app/api/player';
import * as practiceClient from '@app/api/practiceClient';
import * as roundClient from '@app/api/roundClient';
import * as weeklyApi from '@app/api/weeklySummary';
import type { RootStackParamList } from '@app/navigation/types';
import HomeDashboardScreen from '@app/screens/HomeDashboardScreen';
import * as engagementStorage from '@app/storage/engagement';
import * as practiceGoalSettingsStorage from '@app/storage/practiceGoalSettings';
import * as practiceHistory from '@app/storage/practiceMissionHistory';
import type { BagClubStatsMap } from '@shared/caddie/bagStats';
import * as bagPracticeRecommendations from '@shared/caddie/bagPracticeRecommendations';
import { setTelemetryEmitter } from '@app/telemetry';
import { getDefaultWeeklyPracticeGoalSettings } from '@shared/practice/practiceGoalSettings';
import * as experiments from '@shared/experiments/flags';

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
let dateNowSpy: MockInstance<() => number> | null = null;
const mockIsInExperiment = experiments.isInExperiment as unknown as Mock;
const mockGetExperimentBucket = experiments.getExperimentBucket as unknown as Mock;
const mockGetExperimentVariant = experiments.getExperimentVariant as unknown as Mock;

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
vi.mock('@app/storage/practiceMissionHistory', () => ({
  PRACTICE_MISSION_WINDOW_DAYS: 7,
  loadPracticeMissionHistory: vi.fn(),
  summarizeRecentPracticeHistory: vi.fn(),
}));
vi.mock('@app/storage/practiceGoalSettings', () => ({
  loadWeeklyPracticeGoalSettings: vi.fn(),
}));
vi.mock('@shared/caddie/bagPracticeRecommendations', () => ({
  getTopPracticeRecommendation: vi.fn(),
  buildBagPracticeRecommendations: vi.fn().mockReturnValue([]),
}));
vi.mock('@shared/experiments/flags', () => ({
  isInExperiment: vi.fn().mockReturnValue(true),
  getExperimentBucket: vi.fn().mockReturnValue(42),
  getExperimentVariant: vi.fn().mockReturnValue('treatment'),
}));

describe('HomeDashboardScreen', () => {
  beforeEach(() => {
    dateNowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2024-02-08T12:00:00Z').getTime());
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
    vi.mocked(practiceHistory.loadPracticeMissionHistory).mockResolvedValue([]);
    vi.mocked(practiceHistory.summarizeRecentPracticeHistory).mockReturnValue({
      totalSessions: 0,
      completedSessions: 0,
      windowDays: 14,
      lastCompleted: undefined,
      lastStarted: undefined,
    });
    vi.mocked(practiceGoalSettingsStorage.loadWeeklyPracticeGoalSettings).mockResolvedValue(
      getDefaultWeeklyPracticeGoalSettings(),
    );
    vi.mocked(bagPracticeRecommendations.getTopPracticeRecommendation).mockReturnValue(null);
    mockIsInExperiment.mockReturnValue(true);
    mockGetExperimentBucket.mockReturnValue(42);
    mockGetExperimentVariant.mockReturnValue('treatment');
    setTelemetryEmitter(null);
  });

  afterEach(() => {
    dateNowSpy?.mockRestore();
    dateNowSpy = null;
    vi.clearAllMocks();
    setTelemetryEmitter(null);
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

  it('links to practice missions from the home practice card', async () => {
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    const cta = await screen.findByTestId('open-practice-missions');
    fireEvent.click(cta);

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('PracticeMissions', { source: 'home' });
    });
  });

  it('surfaces next practice mission and routes to quick start', async () => {
    const navigation = createNavigation();
    const recommendation: bagPracticeRecommendations.BagPracticeRecommendation = {
      id: 'practice_fill_gap:7i:5w',
      titleKey: 'bag.practice.fill_gap.title',
      descriptionKey: 'bag.practice.fill_gap.description',
      targetClubs: ['7i', '5w'],
      targetSampleCount: 16,
      sourceSuggestionId: 'fill_gap:7i:5w',
      status: 'due',
      priorityScore: 42,
      lastCompletedAt: null,
    };
    vi.mocked(bagPracticeRecommendations.getTopPracticeRecommendation).mockReturnValue(recommendation);

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-next-mission')).toBeVisible();
    expect(screen.getByTestId('practice-next-status')).toHaveTextContent('Due for tune-up');

    fireEvent.click(screen.getByTestId('practice-next-cta'));

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('RangeQuickPracticeStart', {
        practiceRecommendation: recommendation,
        entrySource: 'range_home',
      });
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

  it('shows practice progress prompt when history is empty', async () => {
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-progress-card')).toBeVisible();
    expect(screen.getByTestId('practice-progress-summary')).toHaveTextContent(
      'Start your first recommended session to see progress here.',
    );
  });

  it('shows weekly practice goal encouragement when no missions exist', async () => {
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-goal-summary')).toHaveTextContent(
      'Start your first practice mission this week.',
    );
    expect(screen.queryByTestId('practice-goal-status')).toBeNull();
  });

  it('shows a weekly goal nudge when close to completion and logs telemetry', async () => {
    const navigation = createNavigation();
    const telemetryMock = vi.fn();
    setTelemetryEmitter(telemetryMock);
    mockIsInExperiment.mockReturnValue(true);
    mockGetExperimentBucket.mockReturnValue(7);
    mockGetExperimentVariant.mockReturnValue('treatment');
    vi.mocked(practiceHistory.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'p1',
        missionId: 'mission-1',
        startedAt: '2024-02-05T10:00:00Z',
        endedAt: '2024-02-05T10:30:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 12,
      },
      {
        id: 'p2',
        missionId: 'mission-2',
        startedAt: '2024-02-06T10:00:00Z',
        endedAt: '2024-02-06T10:30:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-goal-nudge')).toBeVisible();

    await waitFor(() => {
      expect(telemetryMock).toHaveBeenCalledWith(
        'practice_goal_nudge_shown',
        expect.objectContaining({ experimentBucket: 7, targetCompletions: 3, completedInWindow: 2 }),
      );
    });

    fireEvent.click(screen.getByTestId('practice-goal-nudge-cta'));

    await waitFor(() => {
      expect(telemetryMock).toHaveBeenCalledWith(
        'practice_goal_nudge_clicked',
        expect.objectContaining({ cta: 'practice_missions' }),
      );
    });
    expect(navigation.navigate).toHaveBeenCalledWith('PracticeMissions', { source: 'home' });
  });

  it('hides the weekly goal nudge when the goal is completed', async () => {
    const navigation = createNavigation();
    mockIsInExperiment.mockReturnValue(true);
    vi.mocked(practiceHistory.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'p1',
        missionId: 'mission-1',
        startedAt: '2024-02-05T10:00:00Z',
        endedAt: '2024-02-05T10:30:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'p2',
        missionId: 'mission-2',
        startedAt: '2024-02-06T10:00:00Z',
        endedAt: '2024-02-06T10:30:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'p3',
        missionId: 'mission-3',
        startedAt: '2024-02-07T10:00:00Z',
        endedAt: '2024-02-07T10:30:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-progress-card')).toBeVisible();
    expect(screen.queryByTestId('practice-goal-nudge')).toBeNull();
  });

  it('surfaces completed missions count in practice progress tile', async () => {
    vi.mocked(practiceHistory.summarizeRecentPracticeHistory).mockReturnValue({
      totalSessions: 3,
      completedSessions: 2,
      windowDays: 14,
      lastCompleted: undefined,
      lastStarted: undefined,
    });
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-progress-card')).toBeVisible();
    expect(screen.getByTestId('practice-progress-summary')).toHaveTextContent(
      'Completed 2 of 3 recommended sessions',
    );
  });

  it('shows a completed weekly plan on the practice tile and tracks analytics', async () => {
    const navigation = createNavigation();
    vi.mocked(bagClient.fetchPlayerBag).mockResolvedValue({ clubs: [] } as bagClient.PlayerBag);
    vi.mocked(bagStatsClient.fetchBagStats).mockResolvedValue({});
    const telemetryMock = vi.fn();
    setTelemetryEmitter(telemetryMock);
    vi.mocked(practiceHistory.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'p1',
        missionId: 'mission-1',
        startedAt: '2024-02-05T10:00:00Z',
        endedAt: '2024-02-05T10:30:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'p2',
        missionId: 'mission-2',
        startedAt: '2024-02-06T10:00:00Z',
        endedAt: '2024-02-06T10:30:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-plan-summary')).toHaveTextContent('Weekly plan: done 🎉');

    await waitFor(() => {
      expect(telemetryMock).toHaveBeenCalledWith(
        'practice_plan_completed_viewed',
        expect.objectContaining({
          entryPoint: 'home',
          completedMissions: 2,
          totalMissions: 2,
          isPlanCompleted: true,
        }),
      );
    });
  });

  it('surfaces partial weekly plan progress on the practice tile', async () => {
    const navigation = createNavigation();
    vi.mocked(bagClient.fetchPlayerBag).mockResolvedValue({ clubs: [] } as bagClient.PlayerBag);
    vi.mocked(bagStatsClient.fetchBagStats).mockResolvedValue({});
    vi.mocked(practiceHistory.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'p1',
        missionId: 'mission-1',
        startedAt: '2024-02-05T10:00:00Z',
        endedAt: '2024-02-05T10:30:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'p2',
        missionId: 'mission-2',
        startedAt: '2024-02-06T10:00:00Z',
        status: 'abandoned',
        targetClubs: [],
        completedSampleCount: 0,
      },
    ]);

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-plan-summary')).toHaveTextContent(
      'Weekly plan: 1 of 2 missions done',
    );
  });

  it('shows catch up status when behind weekly practice goal', async () => {
    vi.mocked(practiceGoalSettingsStorage.loadWeeklyPracticeGoalSettings).mockResolvedValue({
      targetMissionsPerWeek: 5,
    });
    const navigation = createNavigation();
    vi.mocked(practiceHistory.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'e1',
        missionId: 'm1',
        startedAt: '2024-02-05T10:00:00Z',
        endedAt: '2024-02-05T10:30:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'e2',
        missionId: 'm2',
        startedAt: '2024-02-07T10:00:00Z',
        endedAt: '2024-02-07T10:30:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);
    vi.mocked(practiceHistory.summarizeRecentPracticeHistory).mockReturnValue({
      totalSessions: 2,
      completedSessions: 2,
      windowDays: 14,
      lastCompleted: undefined,
      lastStarted: undefined,
    });

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-goal-summary')).toHaveTextContent('2/5 missions this week');
    expect(screen.getByTestId('practice-goal-status')).toHaveTextContent('Catch up');
  });

  it('shows on-track status when weekly practice goal is met', async () => {
    const navigation = createNavigation();
    vi.mocked(practiceHistory.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'e1',
        missionId: 'm1',
        startedAt: '2024-02-04T10:00:00Z',
        endedAt: '2024-02-04T10:30:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'e2',
        missionId: 'm2',
        startedAt: '2024-02-06T10:00:00Z',
        endedAt: '2024-02-06T10:30:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'e3',
        missionId: 'm3',
        startedAt: '2024-02-07T10:00:00Z',
        endedAt: '2024-02-07T10:30:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);
    vi.mocked(practiceHistory.summarizeRecentPracticeHistory).mockReturnValue({
      totalSessions: 3,
      completedSessions: 3,
      windowDays: 14,
      lastCompleted: undefined,
      lastStarted: undefined,
    });

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-goal-summary')).toHaveTextContent('3/3 missions this week');
    expect(screen.getByTestId('practice-goal-status')).toHaveTextContent('Weekly goal complete 🎉');
  });

  it('celebrates when weekly practice goal is exceeded', async () => {
    const navigation = createNavigation();
    vi.mocked(practiceHistory.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'e1',
        missionId: 'm1',
        startedAt: '2024-02-04T10:00:00Z',
        endedAt: '2024-02-04T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'e2',
        missionId: 'm2',
        startedAt: '2024-02-05T10:00:00Z',
        endedAt: '2024-02-05T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'e3',
        missionId: 'm3',
        startedAt: '2024-02-06T10:00:00Z',
        endedAt: '2024-02-06T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'e4',
        missionId: 'm4',
        startedAt: '2024-02-07T10:00:00Z',
        endedAt: '2024-02-07T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);
    vi.mocked(practiceHistory.summarizeRecentPracticeHistory).mockReturnValue({
      totalSessions: 4,
      completedSessions: 4,
      windowDays: 14,
      lastCompleted: undefined,
      lastStarted: undefined,
    });

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-goal-summary')).toHaveTextContent('4/3 missions this week');
    expect(screen.getByTestId('practice-goal-status')).toHaveTextContent("You're ahead of your goal");
  });

  it('shows a weekly streak label when streak spans multiple weeks', async () => {
    vi.mocked(practiceHistory.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'c1',
        missionId: 'm1',
        startedAt: '2024-02-05T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'c2',
        missionId: 'm2',
        startedAt: '2024-02-06T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'c3',
        missionId: 'm3',
        startedAt: '2024-02-07T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'p1',
        missionId: 'm4',
        startedAt: '2024-01-30T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'p2',
        missionId: 'm5',
        startedAt: '2024-01-31T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'p3',
        missionId: 'm6',
        startedAt: '2024-02-01T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-goal-streak')).toHaveTextContent('2-week streak');
  });

  it('computes streaks using the stored weekly goal target', async () => {
    vi.mocked(practiceGoalSettingsStorage.loadWeeklyPracticeGoalSettings).mockResolvedValue({
      targetMissionsPerWeek: 2,
    });
    vi.mocked(practiceHistory.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'c1',
        missionId: 'm1',
        startedAt: '2024-02-06T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'c2',
        missionId: 'm2',
        startedAt: '2024-02-07T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'p1',
        missionId: 'm3',
        startedAt: '2024-01-30T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'p2',
        missionId: 'm4',
        startedAt: '2024-01-31T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-goal-streak')).toHaveTextContent('2-week streak');
  });

  it('omits the weekly streak label when streak is shorter than two weeks', async () => {
    vi.mocked(practiceHistory.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'c1',
        missionId: 'm1',
        startedAt: '2024-02-05T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'c2',
        missionId: 'm2',
        startedAt: '2024-02-06T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
      {
        id: 'c3',
        missionId: 'm3',
        startedAt: '2024-02-07T10:00:00Z',
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 10,
      },
    ]);

    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    await screen.findByTestId('practice-goal-summary');
    expect(screen.queryByTestId('practice-goal-streak')).toBeNull();
  });

  it('surfaces streak copy when streak is active', async () => {
    vi.mocked(practiceHistory.summarizeRecentPracticeHistory).mockReturnValue({
      totalSessions: 4,
      completedSessions: 3,
      windowDays: 14,
      lastCompleted: undefined,
      lastStarted: undefined,
      streakDays: 3,
    });

    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-progress-subtitle')).toHaveTextContent(
      'Practice streak: 3 days in a row',
    );
  });

  it('navigates to weekly practice goal settings from the practice tile', async () => {
    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    const editButton = await screen.findByTestId('edit-practice-goal');
    fireEvent.click(editButton);

    expect(navigation.navigate).toHaveBeenCalledWith('WeeklyPracticeGoalSettings');
  });

  it('navigates to practice history when progress tile is tapped with history', async () => {
    vi.mocked(practiceHistory.summarizeRecentPracticeHistory).mockReturnValue({
      totalSessions: 2,
      completedSessions: 1,
      windowDays: 14,
      lastCompleted: undefined,
      lastStarted: undefined,
      streakDays: 0,
    });

    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    const card = await screen.findByTestId('practice-progress-card');
    fireEvent.click(card);

    expect(navigation.navigate).toHaveBeenCalledWith('PracticeHistory');
  });
});

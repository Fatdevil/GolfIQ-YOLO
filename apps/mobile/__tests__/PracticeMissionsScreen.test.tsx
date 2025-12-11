import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PracticeMissionsScreen from '@app/screens/PracticeMissionsScreen';
import type { RootStackParamList } from '@app/navigation/types';
import * as practiceHistoryStorage from '@app/storage/practiceMissionHistory';
import * as bagClient from '@app/api/bagClient';
import * as bagStatsClient from '@app/api/bagStatsClient';
import * as bagReadiness from '@shared/caddie/bagReadiness';
import { buildPracticeMissionsList, type PracticeMissionListItem } from '@shared/practice/practiceMissionsList';
import { safeEmit } from '@app/telemetry';
import * as practiceHistory from '@shared/practice/practiceHistory';
import * as practiceRecommendations from '@shared/practice/recommendPracticeMissions';

vi.mock('@app/storage/practiceMissionHistory', () => ({
  loadPracticeMissionHistory: vi.fn(),
  PRACTICE_MISSION_WINDOW_DAYS: 14,
}));

vi.mock('@app/api/bagClient', () => ({ fetchPlayerBag: vi.fn() }));
vi.mock('@app/api/bagStatsClient', () => ({ fetchBagStats: vi.fn() }));
vi.mock('@shared/caddie/bagReadiness', () => ({ buildBagReadinessOverview: vi.fn() }));
vi.mock('@shared/practice/practiceMissionsList', () => ({ buildPracticeMissionsList: vi.fn() }));
vi.mock('@app/telemetry', () => ({ safeEmit: vi.fn() }));
vi.mock('@shared/practice/recommendPracticeMissions', () => ({ recommendPracticeMissions: vi.fn() }));

function createNavigation(): NativeStackScreenProps<RootStackParamList, 'PracticeMissions'>['navigation'] {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as any;
}

function createRoute(
  params?: RootStackParamList['PracticeMissions'],
): NativeStackScreenProps<RootStackParamList, 'PracticeMissions'>['route'] {
  return { key: 'PracticeMissions', name: 'PracticeMissions', params } as any;
}

describe('PracticeMissionsScreen', () => {
  const missions: PracticeMissionListItem[] = [
    {
      id: 'mission-high',
      title: 'High priority mission',
      subtitleKey: 'practice.missions.status.overdue',
      status: 'overdue',
      priorityScore: 50,
      lastCompletedAt: null,
      completionCount: 0,
      inStreak: false,
    },
    {
      id: 'mission-low',
      title: 'Low priority mission',
      subtitleKey: 'practice.missions.status.onTrack',
      status: 'onTrack',
      priorityScore: 5,
      lastCompletedAt: null,
      completionCount: 0,
      inStreak: false,
    },
  ];

  const buildWeeklyHistorySpy = vi.spyOn(practiceHistory, 'buildWeeklyPracticeHistory');
  const recommendPracticeMissionsMock = vi.mocked(practiceRecommendations.recommendPracticeMissions);

  beforeEach(() => {
    vi.clearAllMocks();
    buildWeeklyHistorySpy.mockReturnValue([] as any);
    vi.mocked(practiceHistoryStorage.loadPracticeMissionHistory).mockResolvedValue([]);
    vi.mocked(bagClient.fetchPlayerBag).mockResolvedValue(null as any);
    vi.mocked(bagStatsClient.fetchBagStats).mockResolvedValue(null as any);
    vi.mocked(bagReadiness.buildBagReadinessOverview).mockReturnValue(null as any);
    vi.mocked(buildPracticeMissionsList).mockReturnValue(missions);
    recommendPracticeMissionsMock.mockReturnValue([]);
  });

  it('renders missions in provided order with status labels', async () => {
    const navigation = createNavigation();

    render(<PracticeMissionsScreen navigation={navigation} route={createRoute()} />);

    expect(screen.getByTestId('practice-missions-loading')).toBeVisible();

    const list = await screen.findByTestId('practice-missions-list');
    expect(list).toBeVisible();

    const items = await screen.findAllByTestId(/practice-mission-item-/);
    expect(items[0].textContent).toContain('High priority');
    expect(items[1].textContent).toContain('On track');
    expect(screen.getAllByText(/Plan #/i).length).toBeGreaterThanOrEqual(2);
  });

  it('fires analytics when the missions screen is viewed', async () => {
    render(<PracticeMissionsScreen navigation={createNavigation()} route={createRoute({ source: 'home' })} />);

    await screen.findByTestId('practice-missions-list');

    expect(vi.mocked(safeEmit)).toHaveBeenCalledWith('practice_missions_viewed', {
      surface: 'mobile',
      source: 'home',
    });
    expect(vi.mocked(safeEmit)).toHaveBeenCalledWith('practice_plan_viewed', {
      entryPoint: 'practice_missions',
      missionsInPlan: 2,
    });
    expect(vi.mocked(safeEmit)).toHaveBeenCalledWith('weekly_practice_insights_viewed', {
      thisWeekMissions: 0,
      lastWeekMissions: 0,
      thisWeekGoalReached: false,
      lastWeekGoalReached: false,
      thisWeekPlanCompleted: false,
      lastWeekPlanCompleted: false,
      surface: 'practice_missions_mobile',
    });
    expect(vi.mocked(safeEmit)).toHaveBeenCalledWith('practice_weekly_history_viewed', {
      surface: 'mobile_practice_missions',
      weeks: 0,
    });
  });

  it('renders weekly history summaries and emits telemetry', async () => {
    buildWeeklyHistorySpy.mockReturnValue([
      {
        weekStart: new Date('2024-02-12T00:00:00Z'),
        completedCount: 3,
        target: 3,
        goalReached: true,
      },
      {
        weekStart: new Date('2024-02-05T00:00:00Z'),
        completedCount: 1,
        target: 3,
        goalReached: false,
      },
    ] as any);

    render(<PracticeMissionsScreen navigation={createNavigation()} route={createRoute()} />);

    const history = await screen.findByTestId('practice-weekly-history');
    const items = within(history).getAllByTestId(/weekly-history-item-/);
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText(/This week/i)).toBeVisible();
    expect(within(items[0]).getByText('3 / 3 missions')).toBeVisible();
    expect(within(items[1]).getByText(/Last week/i)).toBeVisible();
    expect(within(items[1]).getByText('1 / 3 missions')).toBeVisible();

    expect(vi.mocked(safeEmit)).toHaveBeenCalledWith('practice_weekly_history_viewed', {
      surface: 'mobile_practice_missions',
      weeks: 2,
    });
  });

  it('shows an empty weekly history state when no summaries are available', async () => {
    buildWeeklyHistorySpy.mockReturnValue([] as any);

    render(<PracticeMissionsScreen navigation={createNavigation()} route={createRoute()} />);

    const history = await screen.findByTestId('practice-weekly-history');
    expect(within(history).getByText(/No recent practice weeks yet/i)).toBeVisible();
  });

  it('shows completed plan banner and emits completion analytics when all missions done', async () => {
    vi.mocked(practiceHistoryStorage.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'entry-complete-1',
        missionId: 'mission-high',
        startedAt: new Date().toISOString(),
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 5,
      },
      {
        id: 'entry-complete-2',
        missionId: 'mission-low',
        startedAt: new Date().toISOString(),
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 5,
      },
    ] as any);

    render(<PracticeMissionsScreen navigation={createNavigation()} route={createRoute()} />);

    const banner = await screen.findByText(/completed this week’s practice plan/i);
    expect(banner).toBeVisible();

    const plan = await screen.findByTestId('practice-weekly-plan');
    within(plan)
      .getAllByTestId(/practice-mission-item-/)
      .forEach((node) => expect(within(node).getByText(/Done this week/i)).toBeVisible());

    expect(vi.mocked(safeEmit)).toHaveBeenCalledWith('practice_plan_completed_viewed', {
      entryPoint: 'practice_missions',
      completedMissions: 2,
      totalMissions: 2,
      isPlanCompleted: true,
    });
  });

  it('shows partial progress banner and per-mission completion labels when only some are done', async () => {
    vi.mocked(practiceHistoryStorage.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'entry-partial-1',
        missionId: 'mission-high',
        startedAt: new Date().toISOString(),
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 5,
      },
    ] as any);

    render(<PracticeMissionsScreen navigation={createNavigation()} route={createRoute()} />);

    const progress = await screen.findByText(/1 of 2 missions done this week/i);
    expect(progress).toBeVisible();

    const plan = await screen.findByTestId('practice-weekly-plan');
    expect(within(plan).getByText(/^Done this week$/i)).toBeVisible();
    expect(within(plan).getByText(/Not done yet/i)).toBeVisible();
  });

  it('renders weekly insights comparison and statuses', async () => {
    const now = Date.now();
    vi.mocked(practiceHistoryStorage.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'entry-this-1',
        missionId: 'mission-high',
        startedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 5,
      },
      {
        id: 'entry-this-2',
        missionId: 'mission-low',
        startedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 5,
      },
      {
        id: 'entry-this-3',
        missionId: 'mission-high',
        startedAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 5,
      },
      {
        id: 'entry-last',
        missionId: 'mission-high',
        startedAt: new Date(now - 9 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'completed',
        targetClubs: [],
        completedSampleCount: 5,
      },
    ] as any);

    render(<PracticeMissionsScreen navigation={createNavigation()} route={createRoute()} />);

    const insights = await screen.findByTestId('practice-weekly-insights');
    expect(within(insights).getByText(/This week: 3 missions/i)).toBeVisible();
    expect(within(insights).getByText(/Goal reached/i)).toBeVisible();
    expect(within(insights).getAllByText(/Plan completed/i)[0]).toBeVisible();
    expect(within(insights).getByText(/Last week: 1 missions/i)).toBeVisible();
    expect(within(insights).getByText(/Goal not reached/i)).toBeVisible();
    expect(within(insights).getAllByText(/Plan completed/i)[1]).toBeVisible();
  });

  it('shows empty insights state when there is no history', async () => {
    vi.mocked(practiceHistoryStorage.loadPracticeMissionHistory).mockResolvedValue([]);

    render(<PracticeMissionsScreen navigation={createNavigation()} route={createRoute()} />);

    const insights = await screen.findByTestId('practice-weekly-insights');
    expect(within(insights).getByText(/No missions yet/i)).toBeVisible();
  });

  it('fires analytics when a mission is started from the list', async () => {
    const navigation = createNavigation();

    render(<PracticeMissionsScreen navigation={navigation} route={createRoute()} />);

    const row = await screen.findByTestId('practice-mission-item-mission-low');
    fireEvent.click(row);

    expect(vi.mocked(safeEmit)).toHaveBeenCalledWith('practice_plan_mission_start', {
      entryPoint: 'practice_missions',
      missionId: 'mission-low',
      planRank: 2,
    });
    expect(vi.mocked(safeEmit)).toHaveBeenCalledWith('practice_mission_start', {
      missionId: 'mission-low',
      sourceSurface: 'missions_list',
    });
  });

  it('shows recommended badge and reason when available', async () => {
    recommendPracticeMissionsMock.mockReturnValue([
      { id: 'mission-high', rank: 1, reason: 'focus_area' },
    ] as any);

    render(<PracticeMissionsScreen navigation={createNavigation()} route={createRoute()} />);

    const row = await screen.findByTestId('practice-mission-item-mission-high');
    expect(within(row).getByText(/Recommended$/i)).toBeVisible();
    expect(within(row).getByText(/Recommended for this week’s focus area/i)).toBeVisible();
  });

  it('does not render recommendation UI when helper returns none', async () => {
    recommendPracticeMissionsMock.mockReturnValue([] as any);

    render(<PracticeMissionsScreen navigation={createNavigation()} route={createRoute()} />);

    await screen.findByTestId('practice-missions-list');
    expect(screen.queryByText(/Recommended for this week’s focus area/i)).toBeNull();
    expect(screen.queryByText(/Recommended based on your recent practice/i)).toBeNull();
  });

  it('emits recommendation impression and click analytics', async () => {
    recommendPracticeMissionsMock.mockReturnValue([
      { id: 'mission-high', rank: 1, reason: 'focus_area' },
    ] as any);

    render(<PracticeMissionsScreen navigation={createNavigation()} route={createRoute()} />);

    await waitFor(() => {
      expect(vi.mocked(safeEmit)).toHaveBeenCalledWith(
        'practice_mission_recommendation_shown',
        expect.objectContaining({
          missionId: 'mission-high',
          reason: 'focus_area',
          rank: 1,
          surface: 'mobile_practice_missions',
        }),
      );
    });

    const row = await screen.findByTestId('practice-mission-item-mission-high');
    fireEvent.click(row);

    await waitFor(() => {
      expect(vi.mocked(safeEmit)).toHaveBeenCalledWith(
        'practice_mission_recommendation_clicked',
        expect.objectContaining({
          missionId: 'mission-high',
          reason: 'focus_area',
          rank: 1,
          surface: 'mobile_practice_missions',
          entryPoint: 'weekly_plan',
        }),
      );
    });
  });

  it('does not emit recommendation analytics when none are available', async () => {
    recommendPracticeMissionsMock.mockReturnValue([] as any);

    render(<PracticeMissionsScreen navigation={createNavigation()} route={createRoute()} />);

    await screen.findByTestId('practice-missions-list');

    const recommendationCalls = vi.mocked(safeEmit).mock.calls.filter((call) =>
      String(call[0]).startsWith('practice_mission_recommendation_'),
    );
    expect(recommendationCalls).toHaveLength(0);
  });

  it('navigates to mission detail when a matching history entry exists', async () => {
    vi.mocked(practiceHistoryStorage.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'entry-123',
        missionId: 'mission-high',
        startedAt: new Date().toISOString(),
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 10,
      },
    ] as any);

    vi.mocked(buildPracticeMissionsList).mockReturnValue(missions);

    const navigation = createNavigation();

    render(<PracticeMissionsScreen navigation={navigation} route={createRoute()} />);

    const row = await screen.findByTestId('practice-mission-item-mission-high');
    fireEvent.click(row);

    expect(vi.mocked(navigation.navigate)).toHaveBeenCalledWith('PracticeMissionDetail', { entryId: 'entry-123' });
  });

  it('renders weekly plan header and excludes plan missions from remaining list', async () => {
    const richMissions: PracticeMissionListItem[] = [
      ...missions,
      {
        id: 'mission-mid',
        title: 'Medium priority mission',
        subtitleKey: 'practice.missions.status.dueSoon',
        status: 'dueSoon',
        priorityScore: 20,
        lastCompletedAt: null,
        completionCount: 0,
        inStreak: false,
      },
      {
        id: 'mission-extra',
        title: 'Extra mission',
        subtitleKey: 'practice.missions.status.dueSoon',
        status: 'dueSoon',
        priorityScore: 15,
        lastCompletedAt: null,
        completionCount: 0,
        inStreak: false,
      },
    ];

    vi.mocked(buildPracticeMissionsList).mockReturnValue(richMissions);

    render(<PracticeMissionsScreen navigation={createNavigation()} route={createRoute()} />);

    const plan = await screen.findByTestId('practice-weekly-plan');
    expect(plan).toBeVisible();
    expect(within(plan).getAllByTestId(/practice-mission-item-/)).toHaveLength(3);

    const list = await screen.findByTestId('practice-missions-list');
    const allRendered = within(list).getAllByTestId(/practice-mission-item-/);
    expect(allRendered.map((node) => node.getAttribute('data-testid'))).toEqual([
      'practice-mission-item-mission-high',
      'practice-mission-item-mission-low',
      'practice-mission-item-mission-mid',
      'practice-mission-item-mission-extra',
    ]);
  });

  it('does not render plan section when there are no missions', async () => {
    vi.mocked(buildPracticeMissionsList).mockReturnValue([]);

    render(<PracticeMissionsScreen navigation={createNavigation()} route={createRoute()} />);

    expect(await screen.findByTestId('practice-missions-empty')).toBeVisible();
    expect(screen.queryByTestId('practice-weekly-plan')).toBeNull();
  });
});

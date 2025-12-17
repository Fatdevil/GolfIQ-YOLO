import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HomeScreen from '@app/screens/HomeScreen';
import type { RootStackParamList } from '@app/navigation/types';
import * as playerApi from '@app/api/player';
import * as watchApi from '@app/api/watch';
import * as currentRun from '@app/run/currentRun';
import * as rangeSummary from '@app/range/rangeSummaryStorage';
import * as practicePlanStorage from '@app/practice/practicePlanStorage';
import * as practiceAnalytics from '@app/analytics/practiceHome';

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

vi.mock('@app/range/rangeSummaryStorage', () => ({
  loadLastRangeSessionSummary: vi.fn(),
}));

vi.mock('@app/practice/practicePlanStorage', () => ({
  loadCurrentWeekPracticePlan: vi.fn(),
  getWeekStartISO: vi.fn(() => '2024-01-01T00:00:00.000Z'),
}));

vi.mock('@app/analytics/practiceHome', () => ({
  logPracticeHomeCardViewed: vi.fn(),
  logPracticeHomeCta: vi.fn(),
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

describe('HomeScreen practice card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(watchApi.fetchWatchStatus).mockResolvedValue({ paired: false, lastSeenAt: null });
    vi.mocked(watchApi.requestWatchPairCode).mockResolvedValue({
      code: '123456',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.mocked(currentRun.loadCurrentRun).mockResolvedValue(null);
    vi.mocked(currentRun.clearCurrentRun).mockResolvedValue();
    vi.mocked(rangeSummary.loadLastRangeSessionSummary).mockResolvedValue(null);
    vi.mocked(playerApi.fetchPlayerProfile).mockResolvedValue(mockProfile);
    vi.mocked(playerApi.fetchAccessPlan).mockResolvedValue({ plan: 'free' });
    vi.mocked(playerApi.fetchPlayerAnalytics).mockResolvedValue(null as never);
  });

  it('shows empty practice card when no plan is available', async () => {
    vi.mocked(practicePlanStorage.loadCurrentWeekPracticePlan).mockResolvedValue(null);

    render(<HomeScreen navigation={createNavigation()} route={createRoute()} />);

    expect(await screen.findByTestId('practice-home-card')).toBeInTheDocument();
    expect(screen.getByTestId('practice-home-empty')).toHaveTextContent('No plan yet');
    expect(screen.getByTestId('practice-home-build')).toBeInTheDocument();
    await waitFor(() => {
      expect(practiceAnalytics.logPracticeHomeCardViewed).toHaveBeenCalledWith({
        hasPlan: false,
        totalDrills: undefined,
        completedDrills: undefined,
      });
    });
  });

  it('shows progress when a plan exists', async () => {
    vi.mocked(practicePlanStorage.loadCurrentWeekPracticePlan).mockResolvedValue({
      weekStartISO: '2024-01-01T00:00:00.000Z',
      items: [
        { id: '1', drillId: 'a', createdAt: '2024-01-01', status: 'done' },
        { id: '2', drillId: 'b', createdAt: '2024-01-01', status: 'done' },
        { id: '3', drillId: 'c', createdAt: '2024-01-01', status: 'planned' },
        { id: '4', drillId: 'd', createdAt: '2024-01-01', status: 'planned' },
        { id: '5', drillId: 'e', createdAt: '2024-01-01', status: 'planned' },
      ],
    });

    render(<HomeScreen navigation={createNavigation()} route={createRoute()} />);

    expect(await screen.findByTestId('practice-home-progress')).toHaveTextContent('2/5 drills completed');
    expect(screen.getByTestId('practice-home-start')).toHaveTextContent('Continue practice');
  });

  it('navigates to practice routes from card CTAs', async () => {
    const navigation = createNavigation();
    vi.mocked(practicePlanStorage.loadCurrentWeekPracticePlan).mockResolvedValue({
      weekStartISO: '2024-01-01T00:00:00.000Z',
      items: [
        { id: '1', drillId: 'a', createdAt: '2024-01-01', status: 'planned' },
      ],
    });

    render(<HomeScreen navigation={navigation} route={createRoute()} />);

    fireEvent.click(await screen.findByTestId('practice-home-start'));
    expect(practiceAnalytics.logPracticeHomeCta).toHaveBeenCalledWith('start');
    expect(navigation.navigate).toHaveBeenCalledWith('PracticeSession');

    fireEvent.click(screen.getByTestId('practice-home-view-plan'));
    expect(practiceAnalytics.logPracticeHomeCta).toHaveBeenCalledWith('view_plan');
    expect(navigation.navigate).toHaveBeenCalledWith('PracticePlanner');

    vi.mocked(practicePlanStorage.loadCurrentWeekPracticePlan).mockResolvedValueOnce(null);
    render(<HomeScreen navigation={navigation} route={createRoute()} />);

    fireEvent.click(await screen.findByTestId('practice-home-build'));
    expect(practiceAnalytics.logPracticeHomeCta).toHaveBeenCalledWith('build_plan');
    expect(navigation.navigate).toHaveBeenCalledWith('WeeklySummary');
  });
});

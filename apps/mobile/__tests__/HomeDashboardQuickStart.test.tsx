import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import HomeDashboardScreen from '@app/screens/HomeDashboardScreen';
import * as playerApi from '@app/api/player';
import * as roundClient from '@app/api/roundClient';
import * as weeklyApi from '@app/api/weeklySummary';
import * as practiceClient from '@app/api/practiceClient';
import * as bagClient from '@app/api/bagClient';
import * as engagementStorage from '@app/storage/engagement';
import * as courseClient from '@app/api/courseClient';
import * as roundState from '@app/round/roundState';
import { useGeolocation } from '@app/hooks/useGeolocation';
import type { RootStackParamList } from '@app/navigation/types';

vi.mock('@app/api/player', () => ({ fetchPlayerProfile: vi.fn() }));
vi.mock('@app/api/roundClient', () => ({
  fetchCurrentRound: vi.fn(),
  fetchLatestCompletedRound: vi.fn(),
  startRound: vi.fn(),
}));
vi.mock('@app/api/weeklySummary', () => ({ fetchWeeklySummary: vi.fn() }));
vi.mock('@app/api/practiceClient', () => ({ fetchPracticePlan: vi.fn() }));
vi.mock('@app/api/bagClient', () => ({ fetchPlayerBag: vi.fn() }));
vi.mock('@app/storage/engagement', () => ({
  loadEngagementState: vi.fn(),
  saveEngagementState: vi.fn(),
}));
vi.mock('@app/api/courseClient', () => ({
  fetchCourses: vi.fn(),
  fetchCourseLayout: vi.fn(),
}));
vi.mock('@app/round/roundState', () => ({ saveActiveRoundState: vi.fn() }));
vi.mock('@app/hooks/useGeolocation');

const mockedUseGeolocation = useGeolocation as unknown as Mock;

function createNavigation(): NativeStackScreenProps<RootStackParamList, 'HomeDashboard'>['navigation'] {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as any;
}

function createRoute(): NativeStackScreenProps<RootStackParamList, 'HomeDashboard'>['route'] {
  return { key: 'HomeDashboard', name: 'HomeDashboard' } as any;
}

describe('HomeDashboardScreen quick start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(playerApi.fetchPlayerProfile).mockResolvedValue({
      memberId: 'player-1',
      name: 'Player',
      model: { playerType: 'balanced', style: null, strengths: [], weaknesses: [] },
      plan: { focusCategories: [], steps: [] },
    } as playerApi.PlayerProfile);
    vi.mocked(roundClient.fetchCurrentRound).mockResolvedValue(null);
    vi.mocked(roundClient.fetchLatestCompletedRound).mockResolvedValue(null);
    vi.mocked(weeklyApi.fetchWeeklySummary).mockResolvedValue(null as any);
    vi.mocked(practiceClient.fetchPracticePlan).mockResolvedValue(null as any);
    vi.mocked(bagClient.fetchPlayerBag).mockResolvedValue(null as any);
    vi.mocked(engagementStorage.loadEngagementState).mockResolvedValue({});
    vi.mocked(engagementStorage.saveEngagementState).mockResolvedValue();
    mockedUseGeolocation.mockReturnValue({ position: null, error: null, supported: true, loading: false });
  });

  it('quick starts a round with nearest course and hole suggestion', async () => {
    mockedUseGeolocation.mockReturnValue({
      position: { lat: 59.302, lon: 18.1 },
      error: null,
      supported: true,
      loading: false,
    });
    vi.mocked(courseClient.fetchCourses).mockResolvedValue([
      { id: 'near', name: 'Near Course', holeCount: 18, location: { lat: 59.3, lon: 18.1 } },
      { id: 'far', name: 'Far Course', holeCount: 18, location: { lat: 0, lon: 0 } },
    ]);
    vi.mocked(courseClient.fetchCourseLayout).mockResolvedValue({
      id: 'near',
      name: 'Near Course',
      holes: Array.from({ length: 18 }, (_, index) => ({
        number: index + 1,
        tee: { lat: 59.3 + index * 0.001, lon: 18.1 },
        green: { lat: 59.3005 + index * 0.001, lon: 18.1005 },
      })),
    });
    vi.mocked(roundClient.startRound).mockResolvedValue({
      id: 'round-123',
      courseId: 'near',
      holes: 18,
      startHole: 3,
      startedAt: 'now',
    } as any);
    vi.mocked(roundState.saveActiveRoundState).mockResolvedValue();

    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    const quickStart = await screen.findByTestId('quick-start-round');
    fireEvent.click(quickStart);

    await waitFor(() => {
      expect(roundClient.startRound).toHaveBeenCalledWith({ courseId: 'near', startHole: 3, holes: 18 });
    });
    expect(roundState.saveActiveRoundState).toHaveBeenCalledWith({
      round: expect.objectContaining({ id: 'round-123' }),
      currentHole: 3,
    });
    expect(navigation.navigate).toHaveBeenCalledWith('RoundShot', { roundId: 'round-123' });
  });

  it('falls back to start round when location is unavailable', async () => {
    mockedUseGeolocation.mockReturnValue({ position: null, error: null, supported: false, loading: false });
    vi.mocked(courseClient.fetchCourses).mockResolvedValue([
      { id: 'any', name: 'Any', holeCount: 18, location: { lat: 0, lon: 0 } },
    ]);

    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    const quickStart = await screen.findByTestId('quick-start-round');
    fireEvent.click(quickStart);

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('RoundStart');
    });
    expect(roundClient.startRound).not.toHaveBeenCalled();
  });

  it('falls back when quick start encounters an error', async () => {
    mockedUseGeolocation.mockReturnValue({
      position: { lat: 10, lon: 10 },
      error: null,
      supported: true,
      loading: false,
    });
    vi.mocked(courseClient.fetchCourses).mockResolvedValue([
      { id: 'course', name: 'Course', holeCount: 18, location: { lat: 10, lon: 10 } },
    ]);
    vi.mocked(courseClient.fetchCourseLayout).mockRejectedValue(new Error('boom'));

    const navigation = createNavigation();

    render(<HomeDashboardScreen navigation={navigation} route={createRoute()} />);

    const quickStart = await screen.findByTestId('quick-start-round');
    fireEvent.click(quickStart);

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('RoundStart');
    });
  });
});

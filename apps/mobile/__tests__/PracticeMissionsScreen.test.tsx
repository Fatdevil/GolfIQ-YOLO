import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PracticeMissionsScreen from '@app/screens/PracticeMissionsScreen';
import type { RootStackParamList } from '@app/navigation/types';
import * as practiceHistoryStorage from '@app/storage/practiceMissionHistory';
import * as bagClient from '@app/api/bagClient';
import * as bagStatsClient from '@app/api/bagStatsClient';
import * as bagReadiness from '@shared/caddie/bagReadiness';
import { buildPracticeMissionsList, type PracticeMissionListItem } from '@shared/practice/practiceMissionsList';

vi.mock('@app/storage/practiceMissionHistory', () => ({
  loadPracticeMissionHistory: vi.fn(),
  PRACTICE_MISSION_WINDOW_DAYS: 14,
}));

vi.mock('@app/api/bagClient', () => ({ fetchPlayerBag: vi.fn() }));
vi.mock('@app/api/bagStatsClient', () => ({ fetchBagStats: vi.fn() }));
vi.mock('@shared/caddie/bagReadiness', () => ({ buildBagReadinessOverview: vi.fn() }));
vi.mock('@shared/practice/practiceMissionsList', () => ({ buildPracticeMissionsList: vi.fn() }));

function createNavigation(): NativeStackScreenProps<RootStackParamList, 'PracticeMissions'>['navigation'] {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as any;
}

function createRoute(): NativeStackScreenProps<RootStackParamList, 'PracticeMissions'>['route'] {
  return { key: 'PracticeMissions', name: 'PracticeMissions' } as any;
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(practiceHistoryStorage.loadPracticeMissionHistory).mockResolvedValue([]);
    vi.mocked(bagClient.fetchPlayerBag).mockResolvedValue(null as any);
    vi.mocked(bagStatsClient.fetchBagStats).mockResolvedValue(null as any);
    vi.mocked(bagReadiness.buildBagReadinessOverview).mockReturnValue(null as any);
    vi.mocked(buildPracticeMissionsList).mockReturnValue(missions);
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
});

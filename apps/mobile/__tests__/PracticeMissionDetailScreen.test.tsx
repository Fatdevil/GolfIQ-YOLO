import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PracticeMissionDetailScreen from '@app/screens/PracticeMissionDetailScreen';
import * as practiceHistoryStorage from '@app/storage/practiceMissionHistory';
import * as bagClient from '@app/api/bagClient';
import * as bagStatsClient from '@app/api/bagStatsClient';
import type { RootStackParamList } from '@app/navigation/types';

vi.mock('@app/storage/practiceMissionHistory', () => ({
  loadPracticeMissionHistory: vi.fn(),
}));

vi.mock('@app/api/bagClient', () => ({ fetchPlayerBag: vi.fn() }));
vi.mock('@app/api/bagStatsClient', () => ({ fetchBagStats: vi.fn() }));

function createNavigation(): NativeStackScreenProps<RootStackParamList, 'PracticeMissionDetail'>['navigation'] {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as any;
}

function createRoute(entryId: string): NativeStackScreenProps<RootStackParamList, 'PracticeMissionDetail'>['route'] {
  return { key: 'PracticeMissionDetail', name: 'PracticeMissionDetail', params: { entryId } } as any;
}

describe('PracticeMissionDetailScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bagStatsClient.fetchBagStats).mockResolvedValue({});
    vi.mocked(bagClient.fetchPlayerBag).mockResolvedValue({
      clubs: [
        { clubId: '7i', label: '7 Iron', sampleCount: 20, avgCarryM: null, active: true },
      ],
    } as any);
  });

  it('renders mission details with counts and streak text', async () => {
    const navigation = createNavigation();
    const now = Date.now();

    vi.mocked(practiceHistoryStorage.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'old',
        missionId: 'practice_calibrate:7i',
        startedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        endedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        status: 'completed',
        targetClubs: ['7i'],
        targetSampleCount: 24,
        completedSampleCount: 18,
      },
      {
        id: 'target',
        missionId: 'practice_calibrate:7i',
        startedAt: new Date(now).toISOString(),
        endedAt: new Date(now).toISOString(),
        status: 'completed',
        targetClubs: ['7i'],
        targetSampleCount: 24,
        completedSampleCount: 24,
      },
    ]);

    render(<PracticeMissionDetailScreen navigation={navigation} route={createRoute('target')} />);

    expect(await screen.findByText('Practice details')).toBeVisible();
    expect(screen.getByText(/24 \/ 24 swings/i)).toBeVisible();
    expect(screen.getByText('Contributed to your streak')).toBeVisible();
  });

  it('relaunches quick practice with mission config', async () => {
    const navigation = createNavigation();
    vi.mocked(practiceHistoryStorage.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'target',
        missionId: 'practice_calibrate:7i',
        startedAt: '2024-04-09T10:00:00.000Z',
        endedAt: '2024-04-09T11:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        targetSampleCount: 16,
        completedSampleCount: 12,
      },
    ]);

    render(<PracticeMissionDetailScreen navigation={navigation} route={createRoute('target')} />);

    const button = await screen.findByTestId('repeat-mission-button');
    fireEvent.click(button);

    expect(vi.mocked(navigation.navigate)).toHaveBeenCalledWith('RangeQuickPracticeStart', {
      practiceRecommendation: expect.objectContaining({ targetClubs: ['7i'], targetSampleCount: 16 }),
      missionId: 'practice_calibrate:7i',
    });
  });
});

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PracticeHistoryScreen from '@app/screens/PracticeHistoryScreen';
import * as practiceHistoryStorage from '@app/storage/practiceMissionHistory';
import * as bagClient from '@app/api/bagClient';
import * as bagStatsClient from '@app/api/bagStatsClient';
import type { RootStackParamList } from '@app/navigation/types';

vi.mock('@app/storage/practiceMissionHistory', () => ({
  loadPracticeMissionHistory: vi.fn(),
  PRACTICE_MISSION_WINDOW_DAYS: 14,
}));

vi.mock('@app/api/bagClient', () => ({ fetchPlayerBag: vi.fn() }));
vi.mock('@app/api/bagStatsClient', () => ({ fetchBagStats: vi.fn() }));

function createNavigation(): NativeStackScreenProps<RootStackParamList, 'PracticeHistory'>['navigation'] {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as any;
}

function createRoute(): NativeStackScreenProps<RootStackParamList, 'PracticeHistory'>['route'] {
  return { key: 'PracticeHistory', name: 'PracticeHistory' } as any;
}

describe('PracticeHistoryScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(practiceHistoryStorage.loadPracticeMissionHistory).mockResolvedValue([]);
    vi.mocked(bagClient.fetchPlayerBag).mockResolvedValue({
      clubs: [
        { clubId: '7i', label: '7 Iron', avgCarryM: null, sampleCount: 10, active: true },
        { clubId: '5w', label: '5 Wood', avgCarryM: null, sampleCount: 4, active: true },
      ],
    } as any);
    vi.mocked(bagStatsClient.fetchBagStats).mockResolvedValue({});
  });

  it('renders empty state with CTA', async () => {
    const navigation = createNavigation();

    render(<PracticeHistoryScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByTestId('practice-history-empty')).toBeVisible();
    expect(screen.getByText('No missions yet')).toBeVisible();
    expect(screen.getByText('Start recommended practice')).toBeVisible();
  });

  it('renders mission list newest first', async () => {
    const now = Date.now();
    const newestDateLabel = new Date(now - 6 * 60 * 60 * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    vi.mocked(practiceHistoryStorage.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'old',
        missionId: 'rec-1',
        startedAt: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
        status: 'completed',
        targetClubs: ['5w'],
        completedSampleCount: 6,
      },
      {
        id: 'new',
        missionId: 'rec-1',
        startedAt: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 10,
        targetSampleCount: 12,
      },
    ]);

    const navigation = createNavigation();

    render(<PracticeHistoryScreen navigation={navigation} route={createRoute()} />);

    const items = await screen.findAllByTestId('practice-history-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain(newestDateLabel);
    expect(items[0].textContent).toContain('7 Iron');
    expect(items[0].textContent).toContain('10 / 12 swings');
  });

  it('starts recommended practice from empty state CTA', async () => {
    const navigation = createNavigation();

    render(<PracticeHistoryScreen navigation={navigation} route={createRoute()} />);

    const cta = await screen.findByTestId('practice-history-start');
    fireEvent.click(cta);

    expect(vi.mocked(navigation.navigate).mock.calls[0][0]).toBe('RangeQuickPracticeStart');
  });

  it('opens mission detail when tapping a history row', async () => {
    vi.mocked(practiceHistoryStorage.loadPracticeMissionHistory).mockResolvedValue([
      {
        id: 'entry-1',
        missionId: 'rec-1',
        startedAt: new Date().toISOString(),
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 8,
      },
    ]);

    const navigation = createNavigation();

    render(<PracticeHistoryScreen navigation={navigation} route={createRoute()} />);

    const row = await screen.findByTestId('practice-history-item');
    fireEvent.click(row);

    expect(vi.mocked(navigation.navigate)).toHaveBeenCalledWith('PracticeMissionDetail', { entryId: 'entry-1' });
  });
});

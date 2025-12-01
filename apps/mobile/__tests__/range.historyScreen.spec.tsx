import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import RangeHistoryScreen from '@app/screens/RangeHistoryScreen';
import * as historyStorage from '@app/range/rangeHistoryStorage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';

vi.mock('@app/range/rangeHistoryStorage', () => ({
  loadRangeHistory: vi.fn(),
}));

describe('RangeHistoryScreen', () => {
  type Props = NativeStackScreenProps<RootStackParamList, 'RangeHistory'>;

  function createNavigation(): Props['navigation'] {
    return {
      navigate: vi.fn(),
      setParams: vi.fn(),
      goBack: vi.fn(),
    } as unknown as Props['navigation'];
  }

  function createRoute(): Props['route'] {
    return { key: 'RangeHistory', name: 'RangeHistory' } as Props['route'];
  }

  beforeEach(() => {
    vi.mocked(historyStorage.loadRangeHistory).mockReset();
  });

  it('renders empty state when no history', async () => {
    vi.mocked(historyStorage.loadRangeHistory).mockResolvedValue([]);

    render(<RangeHistoryScreen navigation={createNavigation()} route={createRoute()} />);

    expect(await screen.findByText('No range history yet')).toBeInTheDocument();
    expect(screen.getByText('Finish a Quick Practice session to see your progress here.')).toBeInTheDocument();
  });

  it('renders entries with focus and details', async () => {
    vi.mocked(historyStorage.loadRangeHistory).mockResolvedValue([
      {
        id: 'entry-1',
        savedAt: '2024-04-02T00:00:00.000Z',
        summary: {
          id: 'summary-1',
          startedAt: '2024-04-01T00:00:00.000Z',
          finishedAt: '2024-04-01T01:00:00.000Z',
          club: '7i',
          targetDistanceM: 150,
          shotCount: 6,
          avgCarryM: 148,
          tendency: 'left',
          trainingGoalText: 'Hit smooth draws',
          sessionRating: 4,
          reflectionNotes: 'Need more tempo work',
        },
      },
      {
        id: 'entry-2',
        savedAt: '2024-04-01T00:00:00.000Z',
        summary: {
          id: 'summary-2',
          startedAt: '2024-03-31T00:00:00.000Z',
          finishedAt: '2024-03-31T01:00:00.000Z',
          club: null,
          targetDistanceM: null,
          shotCount: 2,
          avgCarryM: null,
          tendency: null,
        },
      },
    ]);

    const navigation = createNavigation();

    render(<RangeHistoryScreen navigation={navigation} route={createRoute()} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('range-history-item')).toHaveLength(2);
    });

    expect(screen.getByText('Apr 2')).toBeInTheDocument();
    expect(screen.getByText('7i')).toBeInTheDocument();
    expect(screen.getByText('6 shots')).toBeInTheDocument();
    expect(screen.getByText('Focus: direction')).toBeInTheDocument();
    expect(screen.getByText('Goal: Hit smooth draws')).toBeInTheDocument();
    expect(screen.getByText('Has reflection')).toBeInTheDocument();

    expect(screen.getByText('Apr 1')).toBeInTheDocument();
    expect(screen.getByText('Any club')).toBeInTheDocument();
    expect(screen.getByText('2 shots')).toBeInTheDocument();
    expect(screen.getByText('Focus: contact')).toBeInTheDocument();
    expect(screen.getAllByText('Has reflection')).toHaveLength(1);

    fireEvent.click(screen.getAllByTestId('range-history-item')[0]);

    expect(navigation.navigate).toHaveBeenCalledWith('RangeSessionDetail', {
      savedAt: '2024-04-02T00:00:00.000Z',
      summary: expect.objectContaining({ id: 'summary-1' }),
    });
  });
});

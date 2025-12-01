import { fireEvent, render, screen } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Share } from 'react-native';

import type { RootStackParamList } from '@app/navigation/types';
import RangeSessionDetailScreen from '@app/screens/RangeSessionDetailScreen';

describe('RangeSessionDetailScreen', () => {
  type Props = NativeStackScreenProps<RootStackParamList, 'RangeSessionDetail'>;

  const summary: NonNullable<Props['route']['params']>['summary'] = {
    id: 'session-1',
    startedAt: '2024-05-01T10:00:00.000Z',
    finishedAt: '2024-05-01T10:45:00.000Z',
    club: '7i',
    targetDistanceM: 155,
    trainingGoalText: 'Smooth tempo',
    shotCount: 12,
    avgCarryM: 150,
    tendency: 'left',
  };

  const route: Props['route'] = {
    key: 'RangeSessionDetail',
    name: 'RangeSessionDetail',
    params: { summary },
  };

  const navigation = {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as unknown as Props['navigation'];

  beforeEach(() => {
    vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders key details and story', () => {
    render(<RangeSessionDetailScreen navigation={navigation} route={route} />);

    expect(screen.getByText('Range session')).toBeInTheDocument();
    expect(screen.getByText('Smooth tempo')).toBeInTheDocument();
    expect(screen.getByText('Shots')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Average carry')).toBeInTheDocument();
    expect(screen.queryByText('Range session summary')).not.toBeInTheDocument();
    expect(screen.getByTestId('range-session-story')).toBeInTheDocument();
    expect(screen.getByText('Solid distance – now tighten your direction')).toBeInTheDocument();
  });

  it('shares the summary text', async () => {
    render(<RangeSessionDetailScreen navigation={navigation} route={route} />);

    fireEvent.click(screen.getByTestId('share-range-session'));

    expect(Share.share).toHaveBeenCalledWith({
      message: expect.stringContaining('Range session summary'),
    });
  });
});

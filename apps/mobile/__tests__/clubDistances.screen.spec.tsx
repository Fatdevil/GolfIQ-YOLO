import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ClubDistancesScreen from '@app/screens/ClubDistancesScreen';
import * as client from '@app/api/clubDistanceClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';

vi.mock('@app/api/clubDistanceClient', () => ({
  fetchClubDistances: vi.fn(),
}));

describe('ClubDistancesScreen', () => {
  type Props = NativeStackScreenProps<RootStackParamList, 'ClubDistances'>;

  function createNavigation(): Props['navigation'] {
    return { navigate: vi.fn(), setParams: vi.fn(), goBack: vi.fn(), replace: vi.fn() } as Props['navigation'];
  }

  function createRoute(): Props['route'] {
    return { key: 'ClubDistances', name: 'ClubDistances' } as Props['route'];
  }

  beforeEach(() => {
    vi.mocked(client.fetchClubDistances).mockReset();
  });

  it('renders empty state when no clubs', async () => {
    vi.mocked(client.fetchClubDistances).mockResolvedValue([]);

    render(<ClubDistancesScreen navigation={createNavigation()} route={createRoute()} />);

    expect(await screen.findByTestId('club-distances-empty')).toBeInTheDocument();
    expect(screen.getByText('On-course club distances')).toBeInTheDocument();
    expect(
      screen.getByText('Play a few rounds and log clubs for your shots to see true distances here.'),
    ).toBeInTheDocument();
  });

  it('shows club list when data is returned', async () => {
    vi.mocked(client.fetchClubDistances).mockResolvedValue([
      { club: '7i', baselineCarryM: 150, samples: 12, carryStdM: 6, lastUpdated: '2024-05-01T00:00:00Z' },
      { club: 'PW', baselineCarryM: 105, samples: 4, carryStdM: null, lastUpdated: '2024-05-01T00:00:00Z' },
    ]);

    render(<ClubDistancesScreen navigation={createNavigation()} route={createRoute()} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('club-distance-row')).toHaveLength(2);
    });

    expect(screen.getByText('7i')).toBeInTheDocument();
    expect(screen.getByText('150 m')).toBeInTheDocument();
    expect(screen.getByText('from 12 on-course shots')).toBeInTheDocument();
    expect(screen.getByText('±6 m')).toBeInTheDocument();
    expect(screen.getByText('PW')).toBeInTheDocument();
  });
});

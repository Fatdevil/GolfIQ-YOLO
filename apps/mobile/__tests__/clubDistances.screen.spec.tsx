import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ClubDistancesScreen from '@app/screens/ClubDistancesScreen';
import * as client from '@app/api/clubDistanceClient';
import * as caddieApi from '@app/api/caddieApi';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';

vi.mock('@app/api/clubDistanceClient', () => ({
  fetchClubDistances: vi.fn(),
  setClubDistanceOverride: vi.fn(),
  clearClubDistanceOverride: vi.fn(),
}));
vi.mock('@app/api/caddieApi', () => ({
  fetchShotShapeProfile: vi.fn(),
}));

describe('ClubDistancesScreen', () => {
  type Props = NativeStackScreenProps<RootStackParamList, 'ClubDistances'>;

  function createNavigation(): Props['navigation'] {
    return {
      navigate: vi.fn(),
      setParams: vi.fn(),
      goBack: vi.fn(),
      replace: vi.fn(),
      setOptions: vi.fn(),
    } as Props['navigation'];
  }

  function createRoute(): Props['route'] {
    return { key: 'ClubDistances', name: 'ClubDistances' } as Props['route'];
  }

  beforeEach(() => {
    vi.mocked(client.fetchClubDistances).mockReset();
    vi.mocked(client.setClubDistanceOverride).mockReset();
    vi.mocked(client.clearClubDistanceOverride).mockReset();
    vi.mocked(caddieApi.fetchShotShapeProfile).mockReset();
    vi.mocked(caddieApi.fetchShotShapeProfile).mockResolvedValue({
      club: '7i',
      intent: 'straight',
      coreCarryMeanM: 150,
      coreCarryStdM: 5,
      coreSideMeanM: 0,
      coreSideStdM: 3,
      tailLeftProb: 0,
      tailRightProb: 0,
    });
  });

  it('renders empty state when no clubs', async () => {
    vi.mocked(client.fetchClubDistances).mockResolvedValue([]);

    render(<ClubDistancesScreen navigation={createNavigation()} route={createRoute()} />);

    expect(await screen.findByTestId('club-distances-empty')).toBeInTheDocument();
    expect(screen.getByText('On-course club distances')).toBeInTheDocument();
    expect(
      screen.getByText(
        'On-course (auto) distances are calculated from your logged shots with GPS, wind and elevation. If you set a manual standard distance and choose manual, the Caddie will use that instead.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Play a few rounds and log clubs for your shots to see true distances here.'),
    ).toBeInTheDocument();
  });

  it('shows club list when data is returned', async () => {
    vi.mocked(client.fetchClubDistances).mockResolvedValue([
      {
        club: '7i',
        baselineCarryM: 150,
        samples: 12,
        carryStdM: 6,
        manualCarryM: null,
        source: 'auto',
        lastUpdated: '2024-05-01T00:00:00Z',
      },
      {
        club: 'PW',
        baselineCarryM: 105,
        samples: 4,
        carryStdM: null,
        manualCarryM: 90,
        source: 'manual',
        lastUpdated: '2024-05-01T00:00:00Z',
      },
    ]);

    render(<ClubDistancesScreen navigation={createNavigation()} route={createRoute()} />);

    await waitFor(() => {
      expect(screen.getAllByTestId('club-distance-row')).toHaveLength(2);
    });

    const rows = screen.getAllByTestId('club-distance-row');
    expect(within(rows[0]).getByText('7i')).toBeInTheDocument();
    expect(screen.getAllByText('On-course (auto)')).toHaveLength(2);
    expect(within(rows[0]).getByText('150 m')).toBeInTheDocument();
    expect(within(rows[0]).getByText('from 12 on-course shots')).toBeInTheDocument();
    expect(screen.getByText('±6 m')).toBeInTheDocument();
    expect(within(rows[1]).getByText('PW')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Manual: 90 m')).toBeInTheDocument();
  });

  it('saves manual distance and switches source', async () => {
    vi.mocked(client.fetchClubDistances).mockResolvedValue([
      {
        club: '7i',
        baselineCarryM: 150,
        samples: 12,
        carryStdM: 6,
        manualCarryM: null,
        source: 'auto',
        lastUpdated: '2024-05-01T00:00:00Z',
      },
    ]);
    vi.mocked(client.setClubDistanceOverride).mockResolvedValue({
      club: '7i',
      baselineCarryM: 150,
      samples: 12,
      carryStdM: 6,
      manualCarryM: 155,
      source: 'manual',
      lastUpdated: '2024-05-01T00:00:00Z',
    });

    render(<ClubDistancesScreen navigation={createNavigation()} route={createRoute()} />);

    const input = await screen.findByTestId('manual-input-7i');
    fireEvent.input(input, { target: { value: '155' } });
    fireEvent.change(input, { target: { value: '155' } });
    await waitFor(() => expect(input).toHaveValue('155'));
    fireEvent.click(screen.getByTestId('save-manual-7i'));

    await waitFor(() => {
      expect(client.setClubDistanceOverride).toHaveBeenCalledWith('7i', 155, 'manual');
      expect(screen.getByText('Manual: 155 m')).toBeInTheDocument();
      expect(screen.getByText('Caddie uses manual')).toBeInTheDocument();
    });
  });

  it('clears manual override when toggling back to auto', async () => {
    vi.mocked(client.fetchClubDistances).mockResolvedValue([
      {
        club: '7i',
        baselineCarryM: 150,
        samples: 12,
        carryStdM: 6,
        manualCarryM: 155,
        source: 'manual',
        lastUpdated: '2024-05-01T00:00:00Z',
      },
    ]);
    vi.mocked(client.clearClubDistanceOverride).mockResolvedValue({
      club: '7i',
      baselineCarryM: 150,
      samples: 12,
      carryStdM: 6,
      manualCarryM: null,
      source: 'auto',
      lastUpdated: '2024-05-01T00:00:00Z',
    });

    render(<ClubDistancesScreen navigation={createNavigation()} route={createRoute()} />);

    const toggle = await screen.findByTestId('toggle-source-7i');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(client.clearClubDistanceOverride).toHaveBeenCalledWith('7i');
      expect(screen.getByText('Using auto distance')).toBeInTheDocument();
    });
  });
});

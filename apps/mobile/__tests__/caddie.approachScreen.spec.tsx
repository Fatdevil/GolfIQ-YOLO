import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CaddieApproachScreen from '@app/screens/CaddieApproachScreen';
import * as distanceClient from '@app/api/clubDistanceClient';
import * as caddieApi from '@app/api/caddieApi';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CaddieApproach'>;

vi.mock('@app/api/clubDistanceClient', () => ({
  fetchClubDistances: vi.fn(),
}));
vi.mock('@app/api/caddieApi', () => ({
  fetchShotShapeProfile: vi.fn(),
}));

describe('CaddieApproachScreen', () => {
  function createNavigation(): Props['navigation'] {
    return { navigate: vi.fn(), setParams: vi.fn(), goBack: vi.fn(), replace: vi.fn() } as Props['navigation'];
  }

  function createRoute(): Props['route'] {
    return { key: 'CaddieApproach', name: 'CaddieApproach' } as Props['route'];
  }

  beforeEach(() => {
    vi.mocked(distanceClient.fetchClubDistances).mockReset();
    vi.mocked(caddieApi.fetchShotShapeProfile).mockReset();
  });

  it('renders recommendation card when data is available', async () => {
    vi.mocked(distanceClient.fetchClubDistances).mockResolvedValue([
      {
        club: '8i',
        baselineCarryM: 148,
        samples: 6,
        source: 'auto',
        carryStdM: 4,
        lastUpdated: '2024-01-01T00:00:00Z',
      },
      {
        club: '7i',
        baselineCarryM: 160,
        samples: 10,
        source: 'auto',
        carryStdM: 5,
        lastUpdated: '2024-01-01T00:00:00Z',
      },
    ]);
    vi.mocked(caddieApi.fetchShotShapeProfile).mockResolvedValue({
      club: '7i',
      intent: 'straight',
      coreCarryMeanM: 160,
      coreCarryStdM: 6,
      coreSideMeanM: 0,
      coreSideStdM: 5,
      tailLeftProb: 0.03,
      tailRightProb: 0.01,
    });

    render(<CaddieApproachScreen navigation={createNavigation()} route={createRoute()} />);

    await waitFor(() => {
      expect(caddieApi.fetchShotShapeProfile).toHaveBeenCalledWith('7i', 'straight');
    });

    expect(await screen.findByTestId('caddie-recommendation-card')).toBeInTheDocument();
    expect(screen.getByText('7i · straight shot')).toBeInTheDocument();
    expect(screen.getByText(/Plays like/)).toBeInTheDocument();
  });
});

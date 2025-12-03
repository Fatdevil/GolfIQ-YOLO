import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CaddieApproachScreen from '@app/screens/CaddieApproachScreen';
import * as distanceClient from '@app/api/clubDistanceClient';
import * as caddieApi from '@app/api/caddieApi';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';
import * as settingsStorage from '@app/caddie/caddieSettingsStorage';
import * as caddieHudBridge from '@app/watch/caddieHudBridge';

type Props = NativeStackScreenProps<RootStackParamList, 'CaddieApproach'>;

vi.mock('@app/api/clubDistanceClient', () => ({
  fetchClubDistances: vi.fn(),
}));
vi.mock('@app/api/caddieApi', () => ({
  fetchShotShapeProfile: vi.fn(),
}));
vi.mock('@app/caddie/caddieSettingsStorage', () => ({
  loadCaddieSettings: vi.fn(),
  DEFAULT_SETTINGS: { stockShape: 'straight', riskProfile: 'normal' },
}));
vi.mock('@app/watch/caddieHudBridge', () => ({
  isCaddieHudAvailable: vi.fn(() => false),
  sendCaddieHudUpdate: vi.fn(),
  sendCaddieHudClear: vi.fn(),
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
    vi.mocked(settingsStorage.loadCaddieSettings).mockResolvedValue({
      stockShape: 'straight',
      riskProfile: 'normal',
    });
    vi.mocked(caddieHudBridge.isCaddieHudAvailable).mockReturnValue(false);
    vi.mocked(caddieHudBridge.sendCaddieHudUpdate).mockReset();
    vi.mocked(caddieHudBridge.sendCaddieHudClear).mockReset();
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

  it('sends HUD updates when available', async () => {
    vi.mocked(caddieHudBridge.isCaddieHudAvailable).mockReturnValue(true);
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

    await waitFor(() => expect(caddieHudBridge.sendCaddieHudUpdate).toHaveBeenCalled());
    const payload = vi.mocked(caddieHudBridge.sendCaddieHudUpdate).mock.calls[0][0];
    expect(payload).toMatchObject({
      club: '7i',
      intent: 'straight',
      riskProfile: 'normal',
      rawDistanceM: 150,
      playsLikeDistanceM: expect.any(Number),
    });
  });

  it('does not send HUD updates when unavailable', async () => {
    vi.mocked(caddieHudBridge.isCaddieHudAvailable).mockReturnValue(false);
    vi.mocked(distanceClient.fetchClubDistances).mockResolvedValue([
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
      expect(caddieApi.fetchShotShapeProfile).toHaveBeenCalled();
    });
    expect(caddieHudBridge.sendCaddieHudUpdate).not.toHaveBeenCalled();
  });
});

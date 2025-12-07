import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import MyBagScreen from '@app/screens/MyBagScreen';
import { fetchPlayerBag, updatePlayerClubs } from '@app/api/bagClient';
import * as bagStatsClient from '@app/api/bagStatsClient';
import * as apiClient from '@app/api/client';
import * as bagStatsStorage from '@app/storage/bagStatsStorage';

vi.mock('@app/api/bagClient', () => ({
  fetchPlayerBag: vi.fn(),
  updatePlayerClubs: vi.fn(),
}));

const navigation = { navigate: vi.fn() } as any;

const mockFetchBag = fetchPlayerBag as unknown as Mock;
const mockUpdateClubs = updatePlayerClubs as unknown as Mock;
let mockFetchBagStats: ReturnType<typeof vi.spyOn>;

const sampleBag = {
  clubs: [
    { clubId: 'driver', label: 'Driver', avgCarryM: 230, sampleCount: 10, active: true },
    { clubId: '7i', label: '7-iron', avgCarryM: 150, sampleCount: 8, active: true },
  ],
};

const sampleBagStats = {
  driver: { clubId: 'driver', meanDistanceM: 245, sampleCount: 12 },
  '7i': { clubId: '7i', meanDistanceM: 155, sampleCount: 6 },
};

describe('MyBagScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchBag.mockResolvedValue(sampleBag);
    mockUpdateClubs.mockResolvedValue(sampleBag);
    mockFetchBagStats = vi.spyOn(bagStatsClient, 'fetchBagStats');
    mockFetchBagStats.mockResolvedValue(sampleBagStats);
  });

  afterEach(() => {
    mockFetchBagStats.mockRestore();
  });

  it('renders clubs from the bag', async () => {
    const { getByTestId, getByText } = render(
      <MyBagScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => getByTestId('club-card-7i'));
    expect(getByText('7-iron')).toBeTruthy();
    expect(getByText('Driver')).toBeTruthy();
  });

  it('allows toggling a club active state', async () => {
    const updated = {
      ...sampleBag,
      clubs: [
        sampleBag.clubs[0],
        { ...sampleBag.clubs[1], active: false },
      ],
    };
    mockUpdateClubs.mockResolvedValueOnce(updated);

    const { getByTestId } = render(<MyBagScreen navigation={navigation} route={undefined as any} />);
    await waitFor(() => getByTestId('toggle-7i'));

    fireEvent.click(getByTestId('toggle-7i'));

    await waitFor(() => expect(mockUpdateClubs).toHaveBeenCalledWith([{ clubId: '7i', active: false }]));
  });

  it('saves a manual carry override', async () => {
    const updated = {
      ...sampleBag,
      clubs: [
        sampleBag.clubs[0],
        { ...sampleBag.clubs[1], manualAvgCarryM: 165, avgCarryM: 150 },
      ],
    };
    mockUpdateClubs.mockResolvedValueOnce(updated);

    const { getByTestId } = render(<MyBagScreen navigation={navigation} route={undefined as any} />);
    await waitFor(() => getByTestId('manual-input-7i'));

    fireEvent.change(getByTestId('manual-input-7i'), { target: { value: '165' } });
    fireEvent.click(getByTestId('save-7i'));

    await waitFor(() =>
      expect(mockUpdateClubs).toHaveBeenCalledWith([{ clubId: '7i', manualAvgCarryM: 165 }]),
    );
  });

  it('shows auto-calibrated carries when enough samples exist', async () => {
    const { getByTestId } = render(
      <MyBagScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => getByTestId('club-card-driver'));

    const driverCard = within(getByTestId('club-card-driver'));

    expect(driverCard.getByText('Auto-calibrated')).toBeTruthy();
    expect(driverCard.getByText('Auto-calibrated · 12 shots')).toBeTruthy();
    expect(driverCard.getByText('245 m')).toBeTruthy();
  });

  it('preserves bag stats when bag fetch resolves after stats', async () => {
    let resolveBag!: (value: typeof sampleBag) => void;
    const deferredBag = new Promise<typeof sampleBag>((resolve) => {
      resolveBag = resolve;
    });

    mockFetchBag.mockReturnValueOnce(deferredBag);
    mockFetchBagStats.mockResolvedValueOnce(sampleBagStats);

    const { getByTestId } = render(
      <MyBagScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(mockFetchBagStats).toHaveBeenCalled());

    resolveBag(sampleBag);

    await waitFor(() => getByTestId('club-card-driver'));

    const driverCard = within(getByTestId('club-card-driver'));

    expect(driverCard.getByText('Auto-calibrated · 12 shots')).toBeTruthy();
    expect(driverCard.getByText('245 m')).toBeTruthy();
  });

  it('prompts for more samples when stats are below the threshold', async () => {
    mockFetchBagStats.mockResolvedValueOnce({
      driver: sampleBagStats.driver,
      '7i': { clubId: '7i', meanDistanceM: 152, sampleCount: 2 },
    });

    const { getByText, getByTestId } = render(
      <MyBagScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => getByTestId('club-card-7i'));

    expect(getByText('Collect a few more shots to auto-calibrate (2/5)')).toBeTruthy();
  });

  it('uses cached bag stats when online fetch fails', async () => {
    mockFetchBagStats.mockRestore();
    const apiFetchSpy = vi.spyOn(apiClient, 'apiFetch').mockRejectedValueOnce(new Error('offline'));
    const loadCacheSpy = vi
      .spyOn(bagStatsStorage, 'loadCachedBagStats')
      .mockResolvedValueOnce({ payload: sampleBagStats, fetchedAt: Date.now() });
    const isFreshSpy = vi.spyOn(bagStatsStorage, 'isBagStatsFresh').mockReturnValue(true);

    const { getByText, getByTestId } = render(
      <MyBagScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => getByTestId('club-card-driver'));

    expect(apiFetchSpy).toHaveBeenCalled();
    expect(loadCacheSpy).toHaveBeenCalled();
    expect(getByText('245 m')).toBeTruthy();

    apiFetchSpy.mockRestore();
    loadCacheSpy.mockRestore();
    isFreshSpy.mockRestore();
  });

  it('shows error state when bag fetch fails', async () => {
    mockFetchBag.mockRejectedValueOnce(new Error('fail'));
    const { getByTestId } = render(<MyBagScreen navigation={navigation} route={undefined as any} />);

    await waitFor(() => getByTestId('my-bag-error'));
  });
});


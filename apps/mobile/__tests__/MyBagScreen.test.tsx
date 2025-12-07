import React from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
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

  it('renders bag gap insights when a large gap exists', async () => {
    const gapBag = {
      clubs: [
        { clubId: '9i', label: '9 Iron', avgCarryM: 125, sampleCount: 10, active: true },
        { clubId: '7i', label: '7 Iron', avgCarryM: 145, sampleCount: 10, active: true },
        { clubId: '4h', label: '4 Hybrid', avgCarryM: 190, sampleCount: 10, active: true },
      ],
    };
    mockFetchBag.mockResolvedValueOnce(gapBag);
    mockFetchBagStats.mockResolvedValueOnce({
      '9i': { clubId: '9i', meanDistanceM: 125, sampleCount: 8 },
      '7i': { clubId: '7i', meanDistanceM: 150, sampleCount: 9 },
      '4h': { clubId: '4h', meanDistanceM: 210, sampleCount: 12 },
    });

    const { getByTestId, getByText } = render(
      <MyBagScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => getByTestId('bag-insights'));

    expect(getByText('Bag insights')).toBeTruthy();
    expect(
      getByText('Large distance gap between 7 Iron and 4 Hybrid (60 m)'),
    ).toBeTruthy();
  });

  it('shows overlap insights for very small gaps', async () => {
    const overlapBag = {
      clubs: [
        { clubId: '7i', label: '7 Iron', avgCarryM: 150, sampleCount: 10, active: true },
        { clubId: '6i', label: '6 Iron', avgCarryM: 154, sampleCount: 10, active: true },
      ],
    };
    mockFetchBag.mockResolvedValueOnce(overlapBag);
    mockFetchBagStats.mockResolvedValueOnce({
      '7i': { clubId: '7i', meanDistanceM: 150, sampleCount: 9 },
      '6i': { clubId: '6i', meanDistanceM: 156, sampleCount: 9 },
    });

    const { getByTestId, getByText } = render(
      <MyBagScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => getByTestId('bag-insights'));

    expect(getByText('Bag insights')).toBeTruthy();
    expect(
      getByText('7 Iron and 6 Iron carry almost the same distance (6 m apart)'),
    ).toBeTruthy();
  });

  it('shows needs-data hints for clubs without enough samples', async () => {
    const statusBag = {
      clubs: [
        { clubId: 'pw', label: 'PW', avgCarryM: 110, sampleCount: 0, active: true },
        { clubId: 'gw', label: 'GW', avgCarryM: 95, sampleCount: 0, active: true },
      ],
    };
    mockFetchBag.mockResolvedValueOnce(statusBag);
    mockFetchBagStats.mockResolvedValueOnce({
      pw: { clubId: 'pw', meanDistanceM: 110, sampleCount: 2 },
    });

    const { getByText, getByTestId, queryByText } = render(
      <MyBagScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => getByTestId('club-card-pw'));

    expect(getByText(/Collect a few more shots to auto-calibrate/)).toBeTruthy();
    expect(getByText('No shot data yet – default carry in use')).toBeTruthy();

    // When stats improve the hints should go away
    cleanup();
    mockFetchBagStats.mockResolvedValueOnce({
      pw: { clubId: 'pw', meanDistanceM: 112, sampleCount: 6 },
      gw: { clubId: 'gw', meanDistanceM: 96, sampleCount: 6 },
    });
    mockFetchBag.mockResolvedValueOnce(statusBag);

    const rerendered = render(
      <MyBagScreen navigation={navigation} route={undefined as any} />,
    );
    await waitFor(() => rerendered.getByTestId('club-card-pw'));

    expect(rerendered.queryByText(/Collect a few more shots to auto-calibrate/)).toBeNull();
    expect(rerendered.queryByText('No shot data yet – default carry in use')).toBeNull();
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


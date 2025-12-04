import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import MyBagScreen from '@app/screens/MyBagScreen';
import { fetchPlayerBag, updatePlayerClubs } from '@app/api/bagClient';

vi.mock('@app/api/bagClient', () => ({
  fetchPlayerBag: vi.fn(),
  updatePlayerClubs: vi.fn(),
}));

const navigation = { navigate: vi.fn() } as any;

const mockFetchBag = fetchPlayerBag as unknown as Mock;
const mockUpdateClubs = updatePlayerClubs as unknown as Mock;

const sampleBag = {
  clubs: [
    { clubId: 'driver', label: 'Driver', avgCarryM: 230, sampleCount: 10, active: true },
    { clubId: '7i', label: '7-iron', avgCarryM: 150, sampleCount: 8, active: true },
  ],
};

describe('MyBagScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchBag.mockResolvedValue(sampleBag);
    mockUpdateClubs.mockResolvedValue(sampleBag);
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

  it('shows error state when bag fetch fails', async () => {
    mockFetchBag.mockRejectedValueOnce(new Error('fail'));
    const { getByTestId } = render(<MyBagScreen navigation={navigation} route={undefined as any} />);

    await waitFor(() => getByTestId('my-bag-error'));
  });
});


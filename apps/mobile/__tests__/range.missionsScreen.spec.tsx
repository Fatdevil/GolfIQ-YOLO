import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import RangeMissionsScreen from '@app/screens/RangeMissionsScreen';
import * as missionsStorage from '@app/range/rangeMissionsStorage';
import type { RootStackParamList } from '@app/navigation/types';

vi.mock('@app/range/rangeMissionsStorage', () => ({
  loadRangeMissionState: vi.fn(),
  toggleMissionCompleted: vi.fn(),
  setPinnedMission: vi.fn(),
}));

type Props = NativeStackScreenProps<RootStackParamList, 'RangeMissions'>;

function createNavigation(): Props['navigation'] {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as unknown as Props['navigation'];
}

function createRoute(): Props['route'] {
  return { key: 'RangeMissions', name: 'RangeMissions' } as Props['route'];
}

describe('RangeMissionsScreen', () => {
  beforeEach(() => {
    vi.mocked(missionsStorage.loadRangeMissionState).mockResolvedValue({ completedMissionIds: [] });
    vi.mocked(missionsStorage.toggleMissionCompleted).mockResolvedValue({ completedMissionIds: [] });
    vi.mocked(missionsStorage.setPinnedMission).mockResolvedValue({ completedMissionIds: [] });
  });

  it('shows pinned hint and lists missions', async () => {
    const navigation = createNavigation();

    render(<RangeMissionsScreen navigation={navigation} route={createRoute()} />);

    expect(await screen.findByText('No mission pinned')).toBeInTheDocument();
    expect(screen.getByText('Solid contact with wedges')).toBeInTheDocument();
  });

  it('updates completed state when toggled', async () => {
    const navigation = createNavigation();
    vi.mocked(missionsStorage.toggleMissionCompleted).mockResolvedValue({
      completedMissionIds: ['solid_contact_wedges'],
    });

    render(<RangeMissionsScreen navigation={navigation} route={createRoute()} />);

    fireEvent.click(await screen.findByTestId('toggle-complete-solid_contact_wedges'));

    await waitFor(() => {
      expect(screen.getByText('Completed mission')).toBeInTheDocument();
    });
  });

  it('pins mission and shows it in the header', async () => {
    const navigation = createNavigation();
    vi.mocked(missionsStorage.setPinnedMission).mockResolvedValue({
      completedMissionIds: [],
      pinnedMissionId: 'solid_contact_wedges',
    });

    render(<RangeMissionsScreen navigation={navigation} route={createRoute()} />);

    fireEvent.click(await screen.findByTestId('pin-mission-solid_contact_wedges'));

    await waitFor(() => {
      expect(screen.getByText('Pinned mission')).toBeInTheDocument();
      expect(screen.getByText('Pinned as focus mission')).toBeInTheDocument();
    });
  });

  it('navigates to quick practice with mission id', async () => {
    const navigation = createNavigation();

    render(<RangeMissionsScreen navigation={navigation} route={createRoute()} />);

    fireEvent.click(await screen.findByTestId('start-mission-solid_contact_wedges'));

    expect(navigation.navigate).toHaveBeenCalledWith('RangeQuickPracticeStart', { missionId: 'solid_contact_wedges' });
  });
});

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Alert } from 'react-native';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import RoundShotScreen from '@app/screens/RoundShotScreen';
import { appendShot, endRound, getRoundScores, updateHoleScore } from '@app/api/roundClient';
import { fetchCourseLayout } from '@app/api/courseClient';
import { fetchPlayerBag } from '@app/api/bagClient';
import { useGeolocation } from '@app/hooks/useGeolocation';
import {
  clearActiveRoundState,
  loadActiveRoundState,
  saveActiveRoundState,
  type ActiveRoundState,
} from '@app/round/roundState';
import { loadCaddieSettings } from '@app/caddie/caddieSettingsStorage';

vi.mock('@app/api/roundClient');
vi.mock('@app/api/courseClient');
vi.mock('@app/api/bagClient');
vi.mock('@app/round/roundState');
vi.mock('@app/hooks/useGeolocation');
vi.mock('@app/caddie/caddieSettingsStorage');

const mockAppendShot = appendShot as unknown as Mock;
const mockEndRound = endRound as unknown as Mock;
const mockUpdateHoleScore = updateHoleScore as unknown as Mock;
const mockGetScores = getRoundScores as unknown as Mock;
const mockFetchCourseLayout = fetchCourseLayout as unknown as Mock;
const mockFetchPlayerBag = fetchPlayerBag as unknown as Mock;
const mockLoad = loadActiveRoundState as unknown as Mock;
const mockSave = saveActiveRoundState as unknown as Mock;
const mockClear = clearActiveRoundState as unknown as Mock;
const mockUseGeolocation = useGeolocation as unknown as Mock;
const mockLoadCaddieSettings = loadCaddieSettings as unknown as Mock;
const alertSpy = vi.spyOn(Alert, 'alert');

const sampleState: ActiveRoundState = {
  round: {
    id: 'r1',
    holes: 18,
    startedAt: 'now',
    startHole: 1,
    courseName: 'Test Course',
    courseId: 'demo-course',
  },
  currentHole: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  alertSpy.mockImplementation(() => {});
  mockLoad.mockResolvedValue(sampleState);
  mockAppendShot.mockResolvedValue({
    id: 's1',
    roundId: 'r1',
    holeNumber: 1,
    club: '7i',
    createdAt: new Date().toISOString(),
    startLat: 0,
    startLon: 0,
  });
  mockEndRound.mockResolvedValue({ ...sampleState.round, endedAt: 'later' });
  mockUpdateHoleScore.mockResolvedValue({ roundId: 'r1', holes: {} });
  mockGetScores.mockResolvedValue({ roundId: 'r1', holes: {} });
  mockSave.mockResolvedValue(undefined);
  mockClear.mockResolvedValue(undefined);
  mockFetchCourseLayout.mockResolvedValue({
    id: 'demo-course',
    name: 'Demo Course',
    holes: [
      {
        number: 1,
        par: 4,
        yardage_m: 360,
        tee: { lat: 59.3, lon: 18.1 },
        green: { lat: 59.301, lon: 18.101 },
      },
      {
        number: 2,
        par: 3,
        yardage_m: 150,
        tee: { lat: 59.305, lon: 18.103 },
        green: { lat: 59.306, lon: 18.104 },
      },
    ],
  });
  mockFetchPlayerBag.mockResolvedValue({
    clubs: [
      { clubId: 'D', label: 'Driver', avgCarryM: 240, sampleCount: 10, active: true },
      { clubId: '3W', label: '3 Wood', avgCarryM: 225, sampleCount: 8, active: true },
      { clubId: '4i', label: '4 Iron', avgCarryM: 190, sampleCount: 6, active: true },
      { clubId: '7i', label: '7 Iron', avgCarryM: 150, sampleCount: 8, active: true },
    ],
  });
  mockLoadCaddieSettings.mockResolvedValue({ stockShape: 'straight', riskProfile: 'normal' });
  mockUseGeolocation.mockReturnValue({
    position: null,
    error: null,
    supported: true,
    loading: false,
  });
});

(global as any).navigator = {
  geolocation: {
    getCurrentPosition: (success: any) => success({ coords: { latitude: 1, longitude: 2 } }),
  },
};

describe('RoundShotScreen', () => {
  it('logs a shot using current hole and club selection', async () => {
    const navigation = { navigate: vi.fn() } as any;
    const { getByTestId, getByPlaceholderText } = render(
      <RoundShotScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());

    fireEvent.change(getByPlaceholderText('Optional note'), { target: { value: 'Great swing' } });
    fireEvent.click(getByTestId('log-shot'));

    await waitFor(() => expect(mockAppendShot).toHaveBeenCalled());
    expect(mockAppendShot).toHaveBeenCalledWith('r1', expect.objectContaining({
      holeNumber: 1,
      club: '7i',
      startLat: 1,
      startLon: 2,
      note: 'Great swing',
    }));
  });

  it('ends round and navigates to summary', async () => {
    const navigation = { navigate: vi.fn() } as any;
    const { getByText } = render(<RoundShotScreen navigation={navigation} route={undefined as any} />);

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());
    fireEvent.click(getByText('End round'));

    await waitFor(() => expect(mockEndRound).toHaveBeenCalled());
    expect(mockClear).toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('RoundRecap', { roundId: 'r1' });
  });

  it('advances to the next hole and persists state', async () => {
    const { getByText } = render(<RoundShotScreen navigation={{} as any} route={undefined as any} />);

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());
    fireEvent.click(getByText('Next'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({
      ...sampleState,
      currentHole: 2,
    }));
  });

  it('auto-advances after saving a hole', async () => {
    const { getByTestId } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());
    fireEvent.click(getByTestId('save-score'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ ...sampleState, currentHole: 2 }));
  });

  it('prompts to finish on the last hole and navigates to recap', async () => {
    mockLoad.mockResolvedValueOnce({ ...sampleState, currentHole: 2, round: { ...sampleState.round, holes: 2 } });
    alertSpy.mockImplementationOnce((_, __, buttons) => {
      buttons?.[1]?.onPress?.();
    });
    const navigation = { navigate: vi.fn() } as any;
    const { getByTestId } = render(<RoundShotScreen navigation={navigation} route={undefined as any} />);

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());
    fireEvent.click(getByTestId('save-score'));

    await waitFor(() => expect(mockEndRound).toHaveBeenCalled());
    expect(navigation.navigate).toHaveBeenCalledWith('RoundRecap', { roundId: 'r1' });
  });

  it('shows GPS-based hole suggestion hint', async () => {
    mockUseGeolocation.mockReturnValue({
      position: { lat: 59.3001, lon: 18.1001 },
      error: null,
      supported: true,
      loading: false,
    });

    const { findByText } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockFetchCourseLayout).toHaveBeenCalledWith('demo-course'));
    expect(await findByText(/GPS suggests hole 1/)).toBeTruthy();
  });

  it('renders par and yardage from course layout', async () => {
    const { findByText } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockFetchCourseLayout).toHaveBeenCalled());
    expect(await findByText('Par 4')).toBeTruthy();
    expect(await findByText('360 m')).toBeTruthy();
  });

  it('shows caddie targets with layup distance', async () => {
    const { findAllByText, findByTestId, findByText } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockFetchCourseLayout).toHaveBeenCalled());
    expect(await findByTestId('caddie-targets')).toBeTruthy();
    expect(await findByText(/Layup: 216 m from tee/)).toBeTruthy();
    expect(await findByText(/Green: center of green/)).toBeTruthy();
  });

  it('hides caddie hints in tournament-safe mode', async () => {
    mockLoad.mockResolvedValueOnce({ ...sampleState, preferences: { tournamentSafe: true } });

    const { queryByTestId } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockFetchCourseLayout).toHaveBeenCalled());
    expect(queryByTestId('caddie-decision')).toBeNull();
    expect(queryByTestId('caddie-targets')).toBeNull();
  });

  it('shows target-aware layup strategy for safe par 5', async () => {
    mockLoadCaddieSettings.mockResolvedValueOnce({ stockShape: 'straight', riskProfile: 'safe' });
    mockFetchCourseLayout.mockResolvedValueOnce({
      id: 'demo-course',
      name: 'Demo Course',
      holes: [
        {
          number: 1,
          par: 5,
          yardage_m: 480,
          tee: { lat: 59.3, lon: 18.1 },
          green: { lat: 59.301, lon: 18.101 },
        },
      ],
    });

    const { findByTestId, findByText } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockFetchPlayerBag).toHaveBeenCalled());
    await findByTestId('caddie-decision');
    await waitFor(() => expect(document.body.innerHTML).toMatch(/Safe layup/i));
    expect(await findByText(/Club: 3 Wood/)).toBeTruthy();
  });

  it('attacks green for aggressive short par 4', async () => {
    mockLoadCaddieSettings.mockResolvedValueOnce({ stockShape: 'straight', riskProfile: 'aggressive' });
    mockFetchCourseLayout.mockResolvedValueOnce({
      id: 'demo-course',
      name: 'Demo Course',
      holes: [
        {
          number: 1,
          par: 4,
          yardage_m: 300,
          tee: { lat: 59.3, lon: 18.1 },
          green: { lat: 59.301, lon: 18.101 },
        },
      ],
    });

    const { findByTestId, findByText } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockFetchPlayerBag).toHaveBeenCalled());
    await findByTestId('caddie-decision');
    await waitFor(() => expect(document.body.innerHTML).toMatch(/Safe layup/i));
    expect(await findByText(/Club: Driver/)).toBeTruthy();
  });

  it('hides auto-hole hint when geolocation is unavailable', async () => {
    mockUseGeolocation.mockReturnValue({
      position: { lat: 59.3001, lon: 18.1001 },
      error: null,
      supported: false,
      loading: false,
    });

    const { queryByText } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockFetchCourseLayout).toHaveBeenCalled());
    expect(queryByText(/GPS suggests hole/)).toBeNull();
  });

  it('saves scoring changes and auto advances', async () => {
    const { getByLabelText, getByTestId } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());
    fireEvent.click(getByLabelText('Increase strokes'));
    fireEvent.click(getByTestId('save-score'));

    await waitFor(() => expect(mockUpdateHoleScore).toHaveBeenCalledWith('r1', 1, expect.any(Object)));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith({
      ...sampleState,
      currentHole: 2,
    }));
  });

  it('captures fairway miss direction and putt bucket', async () => {
    mockGetScores.mockResolvedValueOnce({
      roundId: 'r1',
      holes: { 1: { holeNumber: 1, par: 4 } },
    });
    const { getByTestId } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());

    fireEvent.click(getByTestId('fairway-left'));
    fireEvent.click(getByTestId('putt-bucket-3_10m'));
    fireEvent.click(getByTestId('save-score'));

    await waitFor(() => expect(mockUpdateHoleScore).toHaveBeenCalled());
    expect(mockUpdateHoleScore).toHaveBeenCalledWith(
      'r1',
      1,
      expect.objectContaining({
        fairwayResult: 'left',
        fairwayHit: false,
        firstPuttDistanceBucket: '3_10m',
      }),
    );
  });

  it('preloads fairway and putt selections when editing', async () => {
    mockGetScores.mockResolvedValueOnce({
      roundId: 'r1',
      holes: {
        1: {
          holeNumber: 1,
          par: 4,
          fairwayResult: 'right',
          fairwayHit: false,
          firstPuttDistanceBucket: '1_3m',
        },
      },
    });

    const { getByTestId } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());
    fireEvent.click(getByTestId('save-score'));

    await waitFor(() => expect(mockUpdateHoleScore).toHaveBeenCalled());
    expect(mockUpdateHoleScore).toHaveBeenCalledWith(
      'r1',
      1,
      expect.objectContaining({
        fairwayResult: 'right',
        firstPuttDistanceBucket: '1_3m',
      }),
    );
  });

  it('renders fallback when no active round exists', async () => {
    mockLoad.mockResolvedValueOnce(null);
    const { findByText } = render(
      <RoundShotScreen navigation={{ navigate: vi.fn() } as any} route={undefined as any} />,
    );

    expect(await findByText('No active round. Start a new one to log shots.')).toBeTruthy();
  });

  it('does not end round when scoring save fails', async () => {
    mockUpdateHoleScore.mockRejectedValueOnce(new Error('boom'));
    const navigation = { navigate: vi.fn() } as any;
    const { getByLabelText, getByText } = render(
      <RoundShotScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());
    fireEvent.click(getByLabelText('Increase strokes'));
    fireEvent.click(getByText('End round'));

    await waitFor(() => expect(mockUpdateHoleScore).toHaveBeenCalled());
    expect(mockEndRound).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(getByText(/Hole 1\/18/)).toBeTruthy();
  });

  it('stays on current hole when save fails on next hole', async () => {
    mockUpdateHoleScore.mockRejectedValueOnce(new Error('network'));
    const { getByLabelText, getByText, queryByText } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());
    fireEvent.click(getByLabelText('Increase strokes'));
    fireEvent.click(getByText('Next'));

    await waitFor(() => expect(mockUpdateHoleScore).toHaveBeenCalled());
    expect(mockSave).not.toHaveBeenCalled();
    expect(queryByText(/Hole 2\/18/)).toBeNull();
    expect(getByText(/Hole 1\/18/)).toBeTruthy();
  });

  it('bounds navigation using starting hole offset', async () => {
    mockLoad.mockResolvedValueOnce({
      round: { id: 'r-offset', holes: 9, startedAt: 'now', startHole: 10, courseName: 'Offset' },
      currentHole: 10,
    });

    const { getByLabelText } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());

    fireEvent.click(getByLabelText('Go to hole 18'));

    await waitFor(() =>
      expect(mockSave).toHaveBeenLastCalledWith(
        expect.objectContaining({
          round: expect.objectContaining({ id: 'r-offset' }),
          currentHole: 18,
        }),
      ),
    );

    await waitFor(() => expect(getByLabelText('Next hole')).toBeDisabled());
    fireEvent.click(getByLabelText('Next hole'));
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('auto-advances correctly from an offset start', async () => {
    mockLoad.mockResolvedValueOnce({
      round: { id: 'r-offset-advance', holes: 9, startedAt: 'now', startHole: 10, courseName: 'Offset' },
      currentHole: 10,
    });

    const { getByLabelText, getByTestId } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());

    fireEvent.click(getByLabelText('Increase strokes'));
    fireEvent.click(getByTestId('save-score'));

    await waitFor(() =>
      expect(mockUpdateHoleScore).toHaveBeenCalledWith('r-offset-advance', 10, expect.any(Object)),
    );

    await waitFor(() =>
      expect(mockSave).toHaveBeenLastCalledWith(
        expect.objectContaining({
          round: expect.objectContaining({ id: 'r-offset-advance' }),
          currentHole: 11,
        }),
      ),
    );
  });

  it('triggers round complete when saving the final offset hole', async () => {
    mockLoad.mockResolvedValueOnce({
      round: { id: 'r-offset-complete', holes: 9, startedAt: 'now', startHole: 10, courseName: 'Offset' },
      currentHole: 18,
    });

    const { getByLabelText, getByTestId } = render(
      <RoundShotScreen navigation={{} as any} route={undefined as any} />,
    );

    await waitFor(() => expect(mockGetScores).toHaveBeenCalled());

    fireEvent.click(getByLabelText('Increase strokes'));
    fireEvent.click(getByTestId('save-score'));

    await waitFor(() =>
      expect(mockUpdateHoleScore).toHaveBeenCalledWith('r-offset-complete', 18, expect.any(Object)),
    );
    expect(alertSpy).toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalledWith(expect.objectContaining({ currentHole: 19 }));
  });
});

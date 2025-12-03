import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import * as rangeApi from '@app/api/range';
import * as rangeHistory from '@app/range/rangeHistoryStorage';
import * as summaryStorage from '@app/range/rangeSummaryStorage';
import RangeQuickPracticeSessionScreen from '@app/screens/RangeQuickPracticeSessionScreen';
import type { RootStackParamList } from '@app/navigation/types';
import type { RangeSession } from '@app/range/rangeSession';
import * as trainingGoalStorage from '@app/range/rangeTrainingGoalStorage';
import * as missionStorage from '@app/range/rangeMissionsStorage';
import * as missions from '@app/range/rangeMissions';
import * as tempoBridge from '@app/watch/tempoTrainerBridge';

vi.mock('@app/api/range', () => ({
  analyzeRangeShot: vi.fn(),
}));

vi.mock('@app/range/rangeSummaryStorage', () => ({
  saveLastRangeSessionSummary: vi.fn(),
}));

vi.mock('@app/range/rangeHistoryStorage', () => ({
  appendRangeHistoryEntry: vi.fn(),
  loadRangeHistory: vi.fn(),
}));

vi.mock('@app/range/rangeTrainingGoalStorage', () => ({
  loadCurrentTrainingGoal: vi.fn(),
}));

vi.mock('@app/range/rangeMissionsStorage', () => ({
  loadRangeMissionState: vi.fn(),
}));

vi.mock('@app/range/rangeMissions', () => ({
  getMissionById: vi.fn(),
}));

vi.mock('@app/watch/tempoTrainerBridge', () => ({
  isTempoTrainerAvailable: vi.fn(),
  sendTempoTrainerActivation: vi.fn(),
  sendTempoTrainerDeactivation: vi.fn(),
  subscribeToTempoTrainerResults: vi.fn(),
}));

type Props = NativeStackScreenProps<RootStackParamList, 'RangeQuickPracticeSession'>;

function createNavigation(): Props['navigation'] {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
    replace: vi.fn(),
  } as unknown as Props['navigation'];
}

function createRoute(session: RangeSession, missionId?: string): Props['route'] {
  return {
    key: 'RangeQuickPracticeSession',
    name: 'RangeQuickPracticeSession',
    params: { session, missionId },
  } as Props['route'];
}

describe('RangeQuickPracticeSessionScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue(null);
    vi.mocked(missionStorage.loadRangeMissionState).mockResolvedValue({ completedMissionIds: [] });
    vi.mocked(rangeHistory.loadRangeHistory).mockResolvedValue([]);
    vi.mocked(tempoBridge.isTempoTrainerAvailable).mockReturnValue(true);
    vi.mocked(tempoBridge.subscribeToTempoTrainerResults).mockReturnValue(() => {});
  });

  it('shows angle label and logs shot with camera angle', async () => {
    const navigation = createNavigation();
    const session: RangeSession = {
      id: 'session-1',
      mode: 'quick',
      startedAt: new Date().toISOString(),
      club: '7i',
      targetDistanceM: 150,
      cameraAngle: 'face_on',
      shots: [],
    };

    vi.mocked(rangeApi.analyzeRangeShot).mockResolvedValue({ carryM: 150, sideDeg: -5, quality: { score: 0.8, level: 'good', reasons: [] } });

    render(<RangeQuickPracticeSessionScreen navigation={navigation} route={createRoute(session)} />);

    expect(screen.getByTestId('angle-label')).toHaveTextContent('Face-on');

    fireEvent.click(screen.getByTestId('log-shot'));

    await waitFor(() => {
      expect(rangeApi.analyzeRangeShot).toHaveBeenCalledWith({
        club: '7i',
        targetDistanceM: 150,
        cameraAngle: 'face_on',
        framesToken: null,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('last-shot-card')).toBeInTheDocument();
    });

    expect(screen.getByText('150 m')).toBeInTheDocument();
    expect(screen.getByText('Left')).toBeInTheDocument();

    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('builds summary with training goal and navigates on finish without persisting', async () => {
    const navigation = createNavigation();
    const session: RangeSession = {
      id: 'session-1',
      mode: 'quick',
      startedAt: '2024-01-01T00:00:00.000Z',
      club: '7i',
      targetDistanceM: 150,
      cameraAngle: 'face_on',
      shots: [
        {
          id: 'shot-1',
          timestamp: '2024-01-01T00:05:00.000Z',
          club: '7i',
          targetDistanceM: 150,
          carryM: 140,
          sideDeg: 2,
        },
        {
          id: 'shot-2',
          timestamp: '2024-01-01T00:10:00.000Z',
          club: '7i',
          targetDistanceM: 150,
          carryM: 150,
          sideDeg: -4,
        },
      ],
    };

    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue({
      id: 'goal-1',
      text: 'Shape fades',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    render(<RangeQuickPracticeSessionScreen navigation={navigation} route={createRoute(session)} />);

    fireEvent.click(screen.getByTestId('end-session'));

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith(
        'RangeQuickPracticeSummary',
        expect.objectContaining({ summary: expect.objectContaining({ trainingGoalText: 'Shape fades' }) }),
      );
      expect(summaryStorage.saveLastRangeSessionSummary).not.toHaveBeenCalled();
      expect(rangeHistory.appendRangeHistoryEntry).not.toHaveBeenCalled();
    });
  });

  it('tags summary with mission from navigation params', async () => {
    const navigation = createNavigation();
    const session: RangeSession = {
      id: 'session-1',
      mode: 'quick',
      startedAt: '2024-01-01T00:00:00.000Z',
      club: '7i',
      targetDistanceM: 150,
      cameraAngle: 'face_on',
      shots: [
        {
          id: 'shot-1',
          timestamp: '2024-01-01T00:05:00.000Z',
          club: '7i',
          targetDistanceM: 150,
          carryM: 140,
          sideDeg: 2,
        },
      ],
    };

    vi.mocked(missions.getMissionById).mockReturnValue({
      id: 'mission-1',
      titleKey: 'range.missionsCatalog.solid_contact_wedges_title',
      descriptionKey: 'range.missionsCatalog.solid_contact_wedges_body',
    } as any);

    render(<RangeQuickPracticeSessionScreen navigation={navigation} route={createRoute(session, 'mission-1')} />);

    fireEvent.click(screen.getByTestId('end-session'));

    await waitFor(() => {
      expect(summaryStorage.saveLastRangeSessionSummary).not.toHaveBeenCalled();
      expect(rangeHistory.appendRangeHistoryEntry).not.toHaveBeenCalled();
      expect(navigation.navigate).toHaveBeenCalledWith(
        'RangeQuickPracticeSummary',
        expect.objectContaining({ summary: expect.objectContaining({ missionId: 'mission-1' }) }),
      );
    });
  });

  it('falls back to pinned mission when none provided', async () => {
    const navigation = createNavigation();
    const session: RangeSession = {
      id: 'session-2',
      mode: 'quick',
      startedAt: '2024-01-01T00:00:00.000Z',
      club: null,
      targetDistanceM: null,
      cameraAngle: 'down_the_line',
      shots: [
        {
          id: 'shot-1',
          timestamp: '2024-01-01T00:05:00.000Z',
          club: null,
          targetDistanceM: null,
          carryM: 120,
          sideDeg: -2,
        },
      ],
    };

    vi.mocked(missionStorage.loadRangeMissionState).mockResolvedValue({
      completedMissionIds: [],
      pinnedMissionId: 'mission-2',
    });
    vi.mocked(missions.getMissionById).mockReturnValue({
      id: 'mission-2',
      titleKey: 'range.missionsCatalog.driver_shape_title',
      descriptionKey: 'range.missionsCatalog.driver_shape_body',
    } as any);

    render(<RangeQuickPracticeSessionScreen navigation={navigation} route={createRoute(session)} />);

    fireEvent.click(screen.getByTestId('end-session'));

    await waitFor(() => {
      expect(rangeHistory.appendRangeHistoryEntry).not.toHaveBeenCalled();
      expect(navigation.navigate).toHaveBeenCalledWith(
        'RangeQuickPracticeSummary',
        expect.objectContaining({ summary: expect.objectContaining({ missionId: 'mission-2' }) }),
      );
    });
  });

  it('redirects to quick practice start when session param is missing', async () => {
    const navigation = createNavigation();

    render(
      <RangeQuickPracticeSessionScreen
        navigation={navigation}
        route={{ key: 'RangeQuickPracticeSession', name: 'RangeQuickPracticeSession' } as Props['route']}
      />,
    );

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('RangeQuickPracticeStart');
    });

    expect(
      screen.getByText('No active range session. Returning to Quick Practice start…'),
    ).toBeInTheDocument();
  });

  it('shows tempo trainer toggle when watch is available and activates trainer', async () => {
    const navigation = createNavigation();
    const session: RangeSession = {
      id: 'session-4',
      mode: 'quick',
      startedAt: new Date().toISOString(),
      club: '7i',
      targetDistanceM: 150,
      cameraAngle: 'down_the_line',
      shots: [],
    };

    vi.mocked(rangeApi.analyzeRangeShot).mockResolvedValue({ carryM: 150, sideDeg: 0 });

    render(<RangeQuickPracticeSessionScreen navigation={navigation} route={createRoute(session)} />);

    const toggle = await screen.findByTestId('tempo-trainer-toggle');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(tempoBridge.sendTempoTrainerActivation).toHaveBeenCalled();
    });
  });

  it('hides tempo trainer toggle when watch is unavailable', () => {
    vi.mocked(tempoBridge.isTempoTrainerAvailable).mockReturnValue(false);
    const navigation = createNavigation();
    const session: RangeSession = {
      id: 'session-4',
      mode: 'quick',
      startedAt: new Date().toISOString(),
      club: '7i',
      targetDistanceM: 150,
      cameraAngle: 'down_the_line',
      shots: [],
    };

    render(<RangeQuickPracticeSessionScreen navigation={navigation} route={createRoute(session)} />);

    expect(screen.queryByTestId('tempo-trainer-toggle')).not.toBeInTheDocument();
  });

  it('uses trainer tempo result for last shot feedback', async () => {
    const navigation = createNavigation();
    const session: RangeSession = {
      id: 'session-5',
      mode: 'quick',
      startedAt: new Date().toISOString(),
      club: '7i',
      targetDistanceM: 150,
      cameraAngle: 'down_the_line',
      shots: [],
    };

    vi.mocked(rangeApi.analyzeRangeShot).mockResolvedValue({ carryM: 140, sideDeg: -2 });
    vi.mocked(tempoBridge.subscribeToTempoTrainerResults).mockImplementation((listener) => {
      listener({
        type: 'tempoTrainer.result',
        backswingMs: 910,
        downswingMs: 300,
        ratio: 3.03,
        withinBand: true,
      });
      return () => {};
    });

    render(<RangeQuickPracticeSessionScreen navigation={navigation} route={createRoute(session)} />);

    fireEvent.click(screen.getByTestId('tempo-trainer-toggle'));
    fireEvent.click(screen.getByTestId('log-shot'));

    await waitFor(() => {
      expect(screen.getByTestId('last-shot-tempo')).toHaveTextContent('3.0');
      expect(screen.getByTestId('tempo-band')).toHaveTextContent('Inside band');
    });
  });
});

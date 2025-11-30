import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import * as rangeApi from '@app/api/range';
import * as summaryStorage from '@app/range/rangeSummaryStorage';
import RangeQuickPracticeSessionScreen from '@app/screens/RangeQuickPracticeSessionScreen';
import type { RootStackParamList } from '@app/navigation/types';
import type { RangeSession } from '@app/range/rangeSession';

vi.mock('@app/api/range', () => ({
  analyzeRangeShot: vi.fn(),
}));

vi.mock('@app/range/rangeSummaryStorage', () => ({
  saveLastRangeSessionSummary: vi.fn(),
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

function createRoute(session: RangeSession): Props['route'] {
  return {
    key: 'RangeQuickPracticeSession',
    name: 'RangeQuickPracticeSession',
    params: { session },
  } as Props['route'];
}

describe('RangeQuickPracticeSessionScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('saves summary and navigates on finish', async () => {
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

    render(<RangeQuickPracticeSessionScreen navigation={navigation} route={createRoute(session)} />);

    fireEvent.click(screen.getByTestId('end-session'));

    await waitFor(() => {
      expect(summaryStorage.saveLastRangeSessionSummary).toHaveBeenCalled();
      expect(navigation.navigate).toHaveBeenCalledWith('RangeQuickPracticeSummary', expect.any(Object));
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
});

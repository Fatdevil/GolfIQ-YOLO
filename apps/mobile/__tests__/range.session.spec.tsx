import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import * as rangeApi from '@app/api/range';
import RangeQuickPracticeSessionScreen from '@app/screens/RangeQuickPracticeSessionScreen';
import type { RootStackParamList } from '@app/navigation/types';
import type { RangeSession } from '@app/range/rangeSession';

vi.mock('@app/api/range', () => ({
  analyzeRangeShot: vi.fn(),
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

    vi.mocked(rangeApi.analyzeRangeShot).mockResolvedValue({ id: 'analysis-1', summary: 'Great swing' });

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
      expect(screen.getByText(/Great swing/)).toBeInTheDocument();
    });

    expect(navigation.replace).not.toHaveBeenCalled();
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

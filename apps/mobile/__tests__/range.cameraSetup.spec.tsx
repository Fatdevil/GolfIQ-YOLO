import { act, fireEvent, render, screen } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import RangeCameraSetupScreen from '@app/screens/RangeCameraSetupScreen';
import type { RootStackParamList } from '@app/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RangeCameraSetup'>;

function createNavigation(): Props['navigation'] {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as unknown as Props['navigation'];
}

function createRoute(): Props['route'] {
  return {
    key: 'RangeCameraSetup',
    name: 'RangeCameraSetup',
    params: { club: '7i', targetDistanceM: 145, cameraAngle: 'down_the_line' },
  } as Props['route'];
}

describe('RangeCameraSetupScreen', () => {
  it('renders instruction copy for down-the-line', () => {
    const navigation = createNavigation();
    render(<RangeCameraSetupScreen navigation={navigation} route={createRoute()} />);

    expect(screen.getByText(/bakom dig/)).toBeInTheDocument();
  });

  it('shows angle OK after stubbed delay and navigates to session', () => {
    vi.useFakeTimers();
    const navigation = createNavigation();
    render(<RangeCameraSetupScreen navigation={navigation} route={createRoute()} />);

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByTestId('angle-ok')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('camera-continue'));
    expect(navigation.navigate).toHaveBeenCalledWith('RangeQuickPracticeSession', {
      session: expect.objectContaining({
        club: '7i',
        targetDistanceM: 145,
        cameraAngle: 'down_the_line',
        mode: 'quick',
      }),
    });
    vi.useRealTimers();
  });
});

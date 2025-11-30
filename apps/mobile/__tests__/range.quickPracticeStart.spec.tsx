import { fireEvent, render, screen } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import RangeQuickPracticeStartScreen from '@app/screens/RangeQuickPracticeStartScreen';
import type { RootStackParamList } from '@app/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RangeQuickPracticeStart'>;

function createNavigation(): Props['navigation'] {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as unknown as Props['navigation'];
}

function createRoute(): Props['route'] {
  return {
    key: 'RangeQuickPracticeStart',
    name: 'RangeQuickPracticeStart',
  } as Props['route'];
}

describe('RangeQuickPracticeStartScreen', () => {
  it('defaults to down-the-line and allows switching angle', () => {
    const navigation = createNavigation();
    render(<RangeQuickPracticeStartScreen navigation={navigation} route={createRoute()} />);

    expect(screen.getByTestId('selected-angle-label')).toHaveTextContent('Down-the-line');

    fireEvent.click(screen.getByTestId('angle-option-face'));
    expect(screen.getByTestId('selected-angle-label')).toHaveTextContent('Face-on');
  });

  it('navigates to camera setup with selected params', () => {
    const navigation = createNavigation();
    render(<RangeQuickPracticeStartScreen navigation={navigation} route={createRoute()} />);

    fireEvent.change(screen.getByTestId('club-input'), { target: { value: '7i' } });
    fireEvent.change(screen.getByTestId('target-input'), { target: { value: '145' } });
    fireEvent.click(screen.getByTestId('angle-option-face'));

    fireEvent.click(screen.getByTestId('start-quick-practice'));

    expect(navigation.navigate).toHaveBeenCalledWith('RangeCameraSetup', {
      club: '7i',
      targetDistanceM: 145,
      cameraAngle: 'face_on',
    });
  });
});

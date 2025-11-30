import { fireEvent, render, screen } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { RootStackParamList } from '@app/navigation/types';
import RangePracticeScreen from '@app/screens/RangePracticeScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'RangePractice'>;

function createNavigation(): Props['navigation'] {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
    replace: vi.fn(),
  } as unknown as Props['navigation'];
}

describe('RangePracticeScreen', () => {
  it('navigates to range history when CTA pressed', () => {
    const navigation = createNavigation();

    render(<RangePracticeScreen navigation={navigation} route={{ key: 'RangePractice', name: 'RangePractice' } as Props['route']} />);

    fireEvent.click(screen.getByTestId('range-history-cta'));

    expect(navigation.navigate).toHaveBeenCalledWith('RangeHistory');
  });
});

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OnboardingScreen from '@app/screens/OnboardingScreen';
import { setHasCompletedOnboarding } from '@app/storage/onboarding';

vi.mock('@app/storage/onboarding', () => ({
  setHasCompletedOnboarding: vi.fn(),
}));

describe('OnboardingScreen', () => {
  it('navigates to demo experience after completing onboarding', async () => {
    const navigation = { replace: vi.fn() } as any;

    const { getByTestId } = render(
      <OnboardingScreen navigation={navigation} route={{ key: 'Onboarding', name: 'Onboarding' } as any} />,
    );

    fireEvent.click(getByTestId('onboarding-try-demo'));

    expect(setHasCompletedOnboarding).toHaveBeenCalledWith(true);
    expect(navigation.replace).toHaveBeenCalledWith('DemoExperience', undefined);
  });

  it('allows skipping to dashboard', async () => {
    const navigation = { replace: vi.fn() } as any;

    const { getByTestId } = render(
      <OnboardingScreen navigation={navigation} route={{ key: 'Onboarding', name: 'Onboarding' } as any} />,
    );

    fireEvent.click(getByTestId('onboarding-go-dashboard'));

    expect(setHasCompletedOnboarding).toHaveBeenCalledWith(true);
    expect(navigation.replace).toHaveBeenCalledWith('HomeDashboard', undefined);
  });
});

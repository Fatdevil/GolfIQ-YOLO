import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import App from '../App';

const registeredScreens: string[] = [];

vi.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: any) => <>{children}</>,
}));

vi.mock('@react-navigation/native-stack', () => {
  const Navigator = ({ children }: any) => <>{children}</>;
  const Screen = ({ name, children }: any) => {
    registeredScreens.push(name);
    return children ?? null;
  };
  return {
    createNativeStackNavigator: vi.fn(() => ({ Navigator, Screen })),
    __esModule: true,
  };
});

vi.mock('@app/storage/onboarding', () => ({
  getHasCompletedOnboarding: vi.fn(async () => true),
}));

vi.mock('@app/linking', () => ({
  __esModule: true,
  default: {},
}));

vi.mock('@app/watch/watchConnectivity', () => ({
  registerWatchTempoTrainerBridge: vi.fn(),
}));

describe('App navigation', () => {
  it('registers the practice session route', async () => {
    render(<App />);

    await waitFor(() => expect(registeredScreens.length).toBeGreaterThan(0));

    expect(registeredScreens).toContain('PracticeSession');
  });
});

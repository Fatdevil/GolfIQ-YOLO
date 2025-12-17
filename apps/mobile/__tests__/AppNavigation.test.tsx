import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

import App from '../App';
import { fetchWeeklySummary } from '@app/api/weeklySummaryClient';
import {
  loadCurrentWeekPracticePlan,
  loadPracticePlan,
  savePracticePlan,
} from '@app/practice/practicePlanStorage';

const registeredScreens: Record<string, React.ComponentType<any>> = {};
const activeRoute: { name: string | null; params: any } = { name: null, params: undefined };
let forceRerender: (() => void) | null = null;

const navigation = {
  navigate: (name: string, params?: any) => {
    if (!registeredScreens[name]) {
      throw new Error(`Route ${name} is not registered`);
    }
    activeRoute.name = name;
    activeRoute.params = params;
    forceRerender?.();
  },
};

vi.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: any) => {
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
      forceRerender = () => setTick((n) => n + 1);
    }, []);

    const ScreenComponent = activeRoute.name ? registeredScreens[activeRoute.name] : null;

    return (
      <>
        {children}
        {ScreenComponent ? (
          <ScreenComponent
            navigation={navigation as any}
            route={{ key: activeRoute.name, name: activeRoute.name, params: activeRoute.params }}
          />
        ) : null}
      </>
    );
  },
}));

vi.mock('@react-navigation/native-stack', () => {
  const Navigator = ({ children, initialRouteName }: any) => {
    activeRoute.name = initialRouteName;
    return children;
  };
  const Screen = ({ name, component, children }: any) => {
    registeredScreens[name] = component ?? children;
    return null;
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

vi.mock('@app/screens/HomeDashboardScreen', () => ({
  __esModule: true,
  default: () => <div data-testid="home-dashboard" />, // lightweight placeholder
}));

vi.mock('@app/api/weeklySummaryClient', () => ({
  fetchWeeklySummary: vi.fn(),
}));

vi.mock('@app/practice/practicePlanStorage', () => ({
  loadCurrentWeekPracticePlan: vi.fn(),
  loadPracticePlan: vi.fn(),
  savePracticePlan: vi.fn(),
  serializePracticePlanWrite: (op: () => Promise<unknown> | unknown) => Promise.resolve(op()).then((v) => v),
  getWeekStartISO: () => '2024-01-01T00:00:00.000Z',
}));

const mockFetchWeeklySummary = fetchWeeklySummary as unknown as Mock;
const mockLoadCurrentWeekPlan = loadCurrentWeekPracticePlan as unknown as Mock;
const mockLoadPracticePlan = loadPracticePlan as unknown as Mock;
const mockSavePracticePlan = savePracticePlan as unknown as Mock;

const plan = {
  weekStartISO: '2024-01-01T00:00:00.000Z',
  items: [
    { id: 'drill-1', drillId: 'putting-lag-ladder', createdAt: '2024-01-02', status: 'planned' as const },
  ],
};

describe('App navigation', () => {
  beforeEach(() => {
    Object.keys(registeredScreens).forEach((key) => delete registeredScreens[key]);
    activeRoute.name = null;
    activeRoute.params = undefined;
    mockFetchWeeklySummary.mockResolvedValue({
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-01-07T00:00:00Z',
      roundsPlayed: 1,
      holesPlayed: 18,
      focusHints: [],
    });
    mockLoadCurrentWeekPlan.mockResolvedValue(plan);
    mockLoadPracticePlan.mockResolvedValue(plan);
    mockSavePracticePlan.mockResolvedValue(plan);
  });

  it('registers the practice session route', async () => {
    render(<App />);

    await waitFor(() => expect(Object.keys(registeredScreens).length).toBeGreaterThan(0));

    expect(Object.keys(registeredScreens)).toContain('PracticeSession');
  });

  it('navigates from Weekly Summary start practice CTA to the session screen', async () => {
    const { findByTestId, getByTestId } = render(<App />);

    await waitFor(() => expect(Object.keys(registeredScreens)).toContain('WeeklySummary'));

    navigation.navigate('WeeklySummary');
    await findByTestId('weekly-start-practice');

    fireEvent.click(getByTestId('weekly-start-practice'));

    expect(await findByTestId('practice-session')).toBeTruthy();
  });

  it('navigates from Practice Planner CTA to the session screen', async () => {
    const { findByTestId, getByTestId } = render(<App />);

    await waitFor(() => expect(Object.keys(registeredScreens)).toContain('PracticePlanner'));

    navigation.navigate('PracticePlanner');
    forceRerender?.();
    await findByTestId('planner-start-session');

    fireEvent.click(getByTestId('planner-start-session'));

    expect(await findByTestId('practice-session')).toBeTruthy();
  });
});

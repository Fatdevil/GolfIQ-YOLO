import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CaddieSetupScreen from '@app/screens/CaddieSetupScreen';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@app/navigation/types';
import * as settingsStorage from '@app/caddie/caddieSettingsStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'CaddieSetup'>;

type Navigation = Props['navigation'];

type Route = Props['route'];

vi.mock('@app/caddie/caddieSettingsStorage', () => ({
  loadCaddieSettings: vi.fn(),
  saveCaddieSettings: vi.fn(),
  DEFAULT_SETTINGS: { stockShape: 'straight', riskProfile: 'normal' },
}));

function createNavigation(): Navigation {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as unknown as Navigation;
}

function createRoute(): Route {
  return { key: 'CaddieSetup', name: 'CaddieSetup' } as Route;
}

describe('CaddieSetupScreen', () => {
  beforeEach(() => {
    vi.mocked(settingsStorage.loadCaddieSettings).mockResolvedValue({
      stockShape: 'straight',
      riskProfile: 'normal',
    });
    vi.mocked(settingsStorage.saveCaddieSettings).mockResolvedValue();
  });

  it('loads stored settings into controls', async () => {
    vi.mocked(settingsStorage.loadCaddieSettings).mockResolvedValue({
      stockShape: 'draw',
      riskProfile: 'aggressive',
    });

    const navigation = createNavigation();
    render(<CaddieSetupScreen navigation={navigation} route={createRoute()} />);

    fireEvent.click(await screen.findByTestId('caddie-setup-save'));

    await waitFor(() => {
      expect(settingsStorage.saveCaddieSettings).toHaveBeenCalledWith({
        stockShape: 'draw',
        riskProfile: 'aggressive',
      });
      expect(navigation.goBack).toHaveBeenCalled();
    });
  });

  it('saves selected settings and navigates back', async () => {
    const navigation = createNavigation();
    render(<CaddieSetupScreen navigation={navigation} route={createRoute()} />);

    fireEvent.click(await screen.findByTestId('stock_shape-draw'));
    fireEvent.click(screen.getByTestId('risk_option-aggressive'));
    fireEvent.click(screen.getByTestId('caddie-setup-save'));

    await waitFor(() => {
      expect(settingsStorage.saveCaddieSettings).toHaveBeenCalledWith({
        stockShape: 'draw',
        riskProfile: 'aggressive',
      });
      expect(navigation.goBack).toHaveBeenCalled();
    });
  });
});

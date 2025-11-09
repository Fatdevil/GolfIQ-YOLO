import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EventJoinScreen from '@app/screens/EventJoinScreen';
import { setTelemetryEmitter } from '@app/telemetry';
import type { RootStackParamList } from '@app/navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as barcodeScanner from 'expo-barcode-scanner';

type Props = NativeStackScreenProps<RootStackParamList, 'EventJoin'>;

type Navigation = Props['navigation'];

type Route = Props['route'];

function createNavigation(): Navigation {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as unknown as Navigation;
}

function createRoute(params?: Route['params']): Route {
  return {
    key: 'EventJoin',
    name: 'EventJoin',
    params,
  } as Route;
}

describe('EventJoinScreen - scan permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setTelemetryEmitter(null);
  });

  it('falls back to manual entry when permissions are denied', async () => {
    const navigation = createNavigation();
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    setTelemetryEmitter((event, payload) => {
      events.push({ event, payload });
    });
    const requestSpy = vi
      .spyOn(barcodeScanner, 'requestPermissionsAsync')
      .mockResolvedValueOnce({ granted: false, status: 'denied' });

    render(<EventJoinScreen navigation={navigation} route={createRoute()} initialCode={null} />);

    fireEvent.click(screen.getByTestId('scan-cta'));

    const hint = await screen.findByTestId('scan-hint');
    expect(hint.textContent).toContain('Kameratillstånd');
    expect(navigation.navigate).not.toHaveBeenCalledWith('EventScan');
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ event: 'events.scan.open', payload: {} });
    expect(events).toContainEqual({ event: 'events.scan.denied', payload: expect.objectContaining({ status: 'denied' }) });

    requestSpy.mockRestore();
  });
});

import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EventScanScreen from '@app/screens/EventScanScreen';
import { setTelemetryEmitter } from '@app/telemetry';
import type { RootStackParamList } from '@app/navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as eventsApi from '@app/api/events';
import { __private__ as barcodeScannerTestUtils } from 'expo-barcode-scanner';

vi.mock('@app/api/events', () => ({
  joinByCode: vi.fn(),
}));

type Props = NativeStackScreenProps<RootStackParamList, 'EventScan'>;

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
    key: 'EventScan',
    name: 'EventScan',
    params,
  } as Route;
}

describe('EventScanScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setTelemetryEmitter(null);
  });

  it('joins event after successful scan', async () => {
    const navigation = createNavigation();
    const joinByCode = vi.mocked(eventsApi.joinByCode);
    joinByCode.mockResolvedValueOnce({ eventId: 'evt-live-123' });
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    setTelemetryEmitter((event, payload) => {
      events.push({ event, payload });
    });

    render(<EventScanScreen navigation={navigation} route={createRoute(undefined)} />);

    await act(async () => {
      barcodeScannerTestUtils.emitScan(screen.getByTestId('barcode-scanner'), { data: 'golfiq://join/ABCD23C' });
    });

    await waitFor(() => {
      expect(joinByCode).toHaveBeenCalledWith('ABCD23C');
      expect(navigation.navigate).toHaveBeenCalledWith('EventLive', { id: 'evt-live-123' });
    });

    expect(events).toContainEqual({
      event: 'events.scan.read',
      payload: expect.objectContaining({ ok: true, code: 'ABCD23C' }),
    });
    expect(events).toContainEqual({
      event: 'events.join.mobile',
      payload: expect.objectContaining({ code: 'ABCD23C' }),
    });
  });
});

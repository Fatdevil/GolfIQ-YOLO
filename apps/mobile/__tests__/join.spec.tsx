import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EventJoinScreen from '@app/screens/EventJoinScreen';
import { setTelemetryEmitter } from '@app/telemetry';
import type { RootStackParamList } from '@app/navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as eventsApi from '@app/api/events';

vi.mock('@app/api/events', () => ({
  joinByCode: vi.fn(),
}));

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

const mockJoin = () => vi.mocked(eventsApi.joinByCode);

describe('EventJoinScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setTelemetryEmitter(null);
  });

  it('shows validation error for invalid codes', async () => {
    const navigation = createNavigation();
    render(<EventJoinScreen navigation={navigation} route={createRoute()} initialCode={null} />);
    const input = screen.getByTestId('join-code-input');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.click(screen.getByTestId('join-submit'));
    const error = await screen.findByTestId('join-error');
    expect(error.textContent).toContain('Enter a valid event code');
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('surfaces API errors', async () => {
    const navigation = createNavigation();
    const joinByCode = mockJoin();
    joinByCode.mockRejectedValueOnce(new Error('Invalid code'));
    render(<EventJoinScreen navigation={navigation} route={createRoute()} initialCode={null} />);
    const input = screen.getByTestId('join-code-input');
    fireEvent.change(input, { target: { value: 'ABCD23C' } });
    fireEvent.click(screen.getByTestId('join-submit'));
    const error = await screen.findByTestId('join-error');
    expect(error.textContent).toContain('Invalid code');
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('navigates to live screen on success and emits telemetry', async () => {
    const navigation = createNavigation();
    const joinByCode = mockJoin();
    joinByCode.mockResolvedValue({ eventId: 'evt-123' });
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    setTelemetryEmitter((event, payload) => {
      events.push({ event, payload });
    });
    render(<EventJoinScreen navigation={navigation} route={createRoute()} initialCode={null} />);
    const input = screen.getByTestId('join-code-input');
    fireEvent.change(input, { target: { value: 'ABCD23C' } });
    fireEvent.click(screen.getByTestId('join-submit'));
    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('EventLive', { id: 'evt-123' });
    });
    expect(events).toContainEqual({ event: 'events.join.mobile', payload: expect.objectContaining({ code: 'ABCD23C' }) });
  });
});

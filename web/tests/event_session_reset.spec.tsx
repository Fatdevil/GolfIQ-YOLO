// @vitest-environment jsdom

import axios from 'axios';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as eventSession from '@web/session/eventSession';

const { EventSessionProvider, useEventSession } = eventSession;

function SessionConsumer(): JSX.Element {
  const session = useEventSession();
  return <div data-testid="session-state">{JSON.stringify(session)}</div>;
}

describe('EventSessionProvider reset behaviour', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('resets to a safe spectator session while loading a new event', async () => {
    const axiosSpy = vi.spyOn(axios, 'get');

    const deferred: { resolve?: (value: unknown) => void } = {};

    axiosSpy.mockImplementation((url) => {
      const target = url.toString();
      if (target.endsWith('/events/A/session')) {
        return Promise.resolve({
          data: { role: 'admin', memberId: 'host-A', safe: false, ts: 1700000000 },
        });
      }
      if (target.endsWith('/events/B/session')) {
        return new Promise((resolve) => {
          deferred.resolve = resolve;
        });
      }
      return Promise.reject(new Error(`Unexpected request: ${target}`));
    });

    const { rerender } = render(
      <EventSessionProvider eventId="A">
        <SessionConsumer />
      </EventSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('session-state').textContent).toContain('"role":"admin"');
    });

    rerender(
      <EventSessionProvider eventId="B">
        <SessionConsumer />
      </EventSessionProvider>,
    );

    await waitFor(() => {
      const snapshot = screen.getByTestId('session-state').textContent ?? '';
      expect(snapshot).toContain('"role":"spectator"');
      expect(snapshot).toContain('"safe":true');
    });

    deferred.resolve?.({
      data: { role: 'spectator', memberId: 'member-B', safe: false, ts: 1700000500 },
    });

    await waitFor(() => {
      expect(screen.getByTestId('session-state').textContent).toContain('"memberId":"member-B"');
    });
  });
});

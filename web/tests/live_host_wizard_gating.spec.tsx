import { render } from '@testing-library/react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';

import HostLiveWizard from '@web/features/live/HostLiveWizard';
import { DEFAULT_SESSION, EventSessionContext } from '@web/session/eventSession';

describe('HostLiveWizard gating', () => {
  const adminSession = { ...DEFAULT_SESSION, role: 'admin' as const, memberId: 'admin-1', safe: false, tournamentSafe: false };
  const globalAny = globalThis as { fetch?: typeof fetch };
  let originalFetch: typeof fetch | undefined;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalAny.fetch;
    fetchSpy = vi.fn();
    globalAny.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      globalAny.fetch = originalFetch;
    } else {
      delete globalAny.fetch;
    }
    vi.restoreAllMocks();
  });

  it('renders nothing for non-admin users', () => {
    const session = { ...DEFAULT_SESSION, role: 'spectator' as const, safe: false, tournamentSafe: false };
    const { container } = render(
      <EventSessionContext.Provider value={session}>
        <HostLiveWizard eventId="evt-1" />
      </EventSessionContext.Provider>,
    );
    expect(container.firstChild).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders nothing when safe mode is enabled', () => {
    const safeSession = { ...adminSession, safe: true, tournamentSafe: true };
    const { container } = render(
      <EventSessionContext.Provider value={safeSession}>
        <HostLiveWizard eventId="evt-1" />
      </EventSessionContext.Provider>,
    );
    expect(container.firstChild).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

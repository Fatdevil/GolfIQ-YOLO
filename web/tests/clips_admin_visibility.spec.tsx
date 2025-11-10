import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ClipModal } from '@web/features/clips/ClipModal';
import type { ShotClip } from '@web/features/clips/types';
import { EventSessionContext } from '@web/session/eventSession';

describe('ClipModal admin visibility', () => {
  const clip: ShotClip = {
    id: 'clip-1',
    ai_title: null,
    ai_summary: null,
  };

  afterEach(() => {
    cleanup();
  });

  it('shows admin CTA when session is admin and safe=false', () => {
    render(
      <EventSessionContext.Provider value={{ role: 'admin', memberId: 'host', safe: false }}>
        <ClipModal clip={clip} />
      </EventSessionContext.Provider>,
    );

    expect(screen.getByText('Request commentary')).toBeTruthy();
  });

  it('hides admin CTA when session is admin but safe=true', () => {
    render(
      <EventSessionContext.Provider value={{ role: 'admin', memberId: 'host', safe: true }}>
        <ClipModal clip={clip} />
      </EventSessionContext.Provider>,
    );

    expect(screen.queryByText('Request commentary')).toBeNull();
  });

  it('hides admin CTA for spectators', () => {
    render(
      <EventSessionContext.Provider value={{ role: 'spectator', memberId: null, safe: false }}>
        <ClipModal clip={clip} />
      </EventSessionContext.Provider>,
    );

    expect(screen.queryByText('Request commentary')).toBeNull();
  });
});

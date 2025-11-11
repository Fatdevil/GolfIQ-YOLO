import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LiveBadge } from '@web/features/live/LiveBadge';
import * as api from '@web/api';

vi.mock('@web/api', async () => {
  const actual = await vi.importActual<typeof import('@web/api')>('@web/api');
  return {
    ...actual,
    postTelemetryEvent: vi.fn().mockResolvedValue(undefined),
  };
});

const postTelemetryEvent = vi.mocked(api.postTelemetryEvent);

describe('LiveBadge', () => {
  beforeEach(() => {
    postTelemetryEvent.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders indicator and viewer count when running', () => {
    render(<LiveBadge eventId="event-1" running viewers={12} startedAt="2024-01-01T00:00:00Z" />);

    expect(screen.getByText('LIVE')).toBeTruthy();
    expect(screen.getByText('12 viewers')).toBeTruthy();
  });

  it('emits telemetry when rendering live badge', async () => {
    render(<LiveBadge eventId="event-2" running viewers={3} startedAt="2024-01-01T00:00:00Z" />);

    await waitFor(() => {
      expect(postTelemetryEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'live.badge.render', eventId: 'event-2', viewers: 3 }),
      );
    });
  });

  it('does not render when live stream is offline', () => {
    render(<LiveBadge eventId="event-3" running={false} viewers={0} />);

    expect(screen.queryByText('LIVE')).toBeNull();
    expect(postTelemetryEvent).not.toHaveBeenCalled();
  });
});

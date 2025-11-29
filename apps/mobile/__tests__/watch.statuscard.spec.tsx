import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WatchStatusCard from '@app/components/WatchStatusCard';
import * as watchApi from '@app/api/watch';

vi.mock('@app/api/watch', () => ({
  fetchWatchStatus: vi.fn(),
  requestWatchPairCode: vi.fn(),
}));

const proPlan = { plan: 'pro' } as const;
const freePlan = { plan: 'free' } as const;

describe('WatchStatusCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(watchApi.fetchWatchStatus).mockResolvedValue({ paired: false, lastSeenAt: null });
    vi.mocked(watchApi.requestWatchPairCode).mockResolvedValue({
      code: '123456',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  it('shows connected status for pro plan', async () => {
    vi.mocked(watchApi.fetchWatchStatus).mockResolvedValue({
      paired: true,
      lastSeenAt: new Date().toISOString(),
    });

    render(<WatchStatusCard memberId="mem-1" plan={proPlan} />);

    expect(await screen.findByTestId('watch-status-label')).toHaveTextContent('Connected');
    expect(watchApi.fetchWatchStatus).toHaveBeenCalledWith('mem-1');
  });

  it('gates UI for free plan', async () => {
    render(<WatchStatusCard memberId="mem-2" plan={freePlan} />);

    expect(screen.getByTestId('watch-status-upgrade')).toBeInTheDocument();
    expect(watchApi.fetchWatchStatus).not.toHaveBeenCalled();
  });

  it('surfaces pair code when requested', async () => {
    vi.mocked(watchApi.requestWatchPairCode).mockResolvedValue({
      code: '789012',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    });

    render(<WatchStatusCard memberId="mem-3" plan={proPlan} />);

    fireEvent.click(await screen.findByTestId('pair-watch'));

    await waitFor(() => {
      expect(screen.getByTestId('pair-code-value')).toHaveTextContent('789012');
    });
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import RangeProgressScreen from '@app/screens/RangeProgressScreen';
import * as rangeHistoryStorage from '@app/range/rangeHistoryStorage';

vi.mock('@app/range/rangeHistoryStorage', () => ({
  loadRangeHistory: vi.fn(),
}));

const mockLoadRangeHistory = vi.mocked(rangeHistoryStorage.loadRangeHistory);

describe('RangeProgressScreen', () => {
  it('shows need-more-data hint for small samples', async () => {
    mockLoadRangeHistory.mockResolvedValue([
      {
        id: '1',
        savedAt: '2024-08-10T10:00:00.000Z',
        summary: {
          id: 's1',
          startedAt: '2024-08-10T09:00:00.000Z',
          finishedAt: '2024-08-10T10:00:00.000Z',
          club: '7i',
          shotCount: 10,
          tendency: 'left',
        },
      },
      {
        id: '2',
        savedAt: '2024-08-08T10:00:00.000Z',
        summary: {
          id: 's2',
          startedAt: '2024-08-08T09:00:00.000Z',
          finishedAt: '2024-08-08T10:00:00.000Z',
          club: '9i',
          shotCount: 8,
          tendency: 'right',
        },
      },
    ] as any);

    render(<RangeProgressScreen />);

    await waitFor(() => {
      expect(screen.getByText('Range progress')).toBeInTheDocument();
    });

    expect(screen.getByText('Record a few more sessions to unlock quality trends.')).toBeInTheDocument();
    expect(screen.queryByText(/Solid contact/)).not.toBeInTheDocument();
    expect(screen.queryByText(/misses are mostly/)).not.toBeInTheDocument();
  });

  it('shows quality hints when recent data is sufficient', async () => {
    mockLoadRangeHistory.mockResolvedValue([
      {
        id: '1',
        savedAt: '2024-08-15T10:00:00.000Z',
        summary: {
          id: 's1',
          startedAt: '2024-08-15T09:00:00.000Z',
          finishedAt: '2024-08-15T10:00:00.000Z',
          club: '7i',
          shotCount: 15,
          contactPct: 70,
          tendency: 'right',
        },
      },
      {
        id: '2',
        savedAt: '2024-08-12T10:00:00.000Z',
        summary: {
          id: 's2',
          startedAt: '2024-08-12T09:00:00.000Z',
          finishedAt: '2024-08-12T10:00:00.000Z',
          club: '7i',
          shotCount: 15,
          contactPct: 80,
          tendency: 'right',
        },
      },
      {
        id: '3',
        savedAt: '2024-08-10T10:00:00.000Z',
        summary: {
          id: 's3',
          startedAt: '2024-08-10T09:00:00.000Z',
          finishedAt: '2024-08-10T10:00:00.000Z',
          club: 'PW',
          shotCount: 20,
          contactPct: 90,
          tendency: 'left',
        },
      },
    ] as any);

    render(<RangeProgressScreen />);

    expect(await screen.findByText('Solid contact across these sessions: 80%')).toBeInTheDocument();
    expect(screen.getByText('Your misses are mostly right of target.')).toBeInTheDocument();
    expect(screen.queryByText('Record a few more sessions to unlock quality trends.')).not.toBeInTheDocument();
  });
});

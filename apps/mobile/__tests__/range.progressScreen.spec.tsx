import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Share } from 'react-native';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import RangeProgressScreen from '@app/screens/RangeProgressScreen';
import * as rangeHistoryStorage from '@app/range/rangeHistoryStorage';
import * as rangeCoachSummary from '@app/range/rangeCoachSummary';
import * as trainingGoalStorage from '@app/range/rangeTrainingGoalStorage';
import * as missionsStorage from '@app/range/rangeMissionsStorage';

vi.mock('@app/range/rangeHistoryStorage', () => ({
  loadRangeHistory: vi.fn(),
  markSessionsSharedToCoach: vi.fn(),
}));

vi.mock('@app/range/rangeCoachSummary', () => ({
  formatCoachSummaryText: vi.fn(),
  pickRecentCoachSummarySessions: vi.fn(),
}));

vi.mock('@app/range/rangeTrainingGoalStorage', () => ({
  loadCurrentTrainingGoal: vi.fn(),
}));

vi.mock('@app/range/rangeMissionsStorage', () => ({
  loadRangeMissionState: vi.fn(),
}));

const mockLoadRangeHistory = vi.mocked(rangeHistoryStorage.loadRangeHistory);
const mockMarkSessionsSharedToCoach = vi.mocked(rangeHistoryStorage.markSessionsSharedToCoach);
const mockFormatCoachSummaryText = vi.mocked(rangeCoachSummary.formatCoachSummaryText);
const mockPickRecentCoachSummarySessions = vi.mocked(rangeCoachSummary.pickRecentCoachSummarySessions);
const mockLoadCurrentTrainingGoal = vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal);
const mockLoadRangeMissionState = vi.mocked(missionsStorage.loadRangeMissionState);

beforeEach(() => {
  mockLoadRangeHistory.mockReset();
  mockMarkSessionsSharedToCoach.mockReset();
  mockFormatCoachSummaryText.mockReset();
  mockPickRecentCoachSummarySessions.mockReset();
  mockLoadCurrentTrainingGoal.mockReset();
  mockLoadRangeMissionState.mockReset();

  mockLoadCurrentTrainingGoal.mockResolvedValue(null);
  mockLoadRangeMissionState.mockResolvedValue({ completedMissionIds: [] });
  mockFormatCoachSummaryText.mockReturnValue('');
  mockPickRecentCoachSummarySessions.mockReturnValue([]);
  mockMarkSessionsSharedToCoach.mockResolvedValue();

  vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('hides share CTA when there is no history', async () => {
    mockLoadRangeHistory.mockResolvedValue([] as any);

    render(<RangeProgressScreen />);

    expect(await screen.findByText('No recorded range practice yet')).toBeInTheDocument();
    expect(screen.queryByTestId('share-coach-summary')).not.toBeInTheDocument();
  });

  it('shares the coach summary and marks recent sessions', async () => {
    const history = [
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
    ] as any;

    mockLoadRangeHistory.mockResolvedValue(history);
    mockFormatCoachSummaryText.mockReturnValue('Coach summary text');
    mockPickRecentCoachSummarySessions.mockReturnValue(history);
    mockLoadCurrentTrainingGoal.mockResolvedValue({ id: 'goal-1', text: 'Tempo', createdAt: '2024-01-01' });
    mockLoadRangeMissionState.mockResolvedValue({ completedMissionIds: [], pinnedMissionId: 'start_line_7iron' });

    render(<RangeProgressScreen />);

    const shareButton = await screen.findByTestId('share-coach-summary');
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(Share.share).toHaveBeenCalledWith({ message: 'Coach summary text' });
    });

    expect(mockFormatCoachSummaryText).toHaveBeenCalledWith(
      {
        history,
        trainingGoal: { id: 'goal-1', text: 'Tempo', createdAt: '2024-01-01' },
        missionState: { completedMissionIds: [], pinnedMissionId: 'start_line_7iron' },
      },
      expect.any(Function),
    );
    expect(mockMarkSessionsSharedToCoach).toHaveBeenCalledWith(['s1', 's2']);
  });
});

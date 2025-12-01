import { describe, expect, it } from 'vitest';

import { t } from '@app/i18n';
import { formatCoachSummaryText, pickRecentCoachSummarySessions } from '@app/range/rangeCoachSummary';

const baseHistory = [
  {
    id: '1',
    savedAt: '2024-04-10T10:00:00.000Z',
    summary: {
      id: 's1',
      startedAt: '2024-04-10T09:00:00.000Z',
      finishedAt: '2024-04-10T10:00:00.000Z',
      club: '7i',
      shotCount: 20,
      missionId: 'start_line_7iron',
      avgCarryM: 152,
      targetDistanceM: 155,
      sessionRating: 4,
      reflectionNotes: 'Added tempo work',
    },
  },
  {
    id: '2',
    savedAt: '2024-04-05T10:00:00.000Z',
    summary: {
      id: 's2',
      startedAt: '2024-04-05T09:00:00.000Z',
      finishedAt: '2024-04-05T10:00:00.000Z',
      club: 'Driver',
      shotCount: 15,
      missionId: 'driver_shape',
      avgCarryM: 240,
      targetDistanceM: 245,
      trainingGoalText: 'Smooth tempo',
    },
  },
];

describe('rangeCoachSummary', () => {
  it('formats a coach-friendly summary with goal, mission, stats, and recent sessions', () => {
    const ctx = {
      history: baseHistory,
      trainingGoal: { id: 'tg-1', text: 'Find a consistent draw', createdAt: '2024-03-01T00:00:00.000Z' },
      missionState: { completedMissionIds: [], pinnedMissionId: 'start_line_7iron' },
    };

    const text = formatCoachSummaryText(ctx, t);

    expect(text).toContain('Range coach summary');
    expect(text).toContain('Current training goal: Find a consistent draw');
    expect(text).toContain('Pinned mission: Start line with 7-iron');
    expect(text).toContain('Recorded range practice: 2 sessions · 35 shots');
    expect(text).toContain('Most recorded clubs: 7i (20), Driver (15)');
    expect(text).toContain('1) Apr 10, 2024 · 7i · 20 shots · Mission: Start line with 7-iron');
    expect(text).toContain('Story:');
    expect(text).toContain('Rating: 4/5');
    expect(text).toContain('Notes: Added tempo work');
  });

  it('handles empty history with a short fallback message', () => {
    const text = formatCoachSummaryText(
      {
        history: [],
        trainingGoal: null,
        missionState: { completedMissionIds: [] },
      },
      t,
    );

    expect(text).toContain('No recorded sessions yet.');
  });

  it('picks most recent sessions first', () => {
    const shuffled = [baseHistory[1], baseHistory[0]];
    const picked = pickRecentCoachSummarySessions(shuffled, 1);

    expect(picked[0].summary.id).toBe('s1');
  });
});

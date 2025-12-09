import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { recordPracticeMissionOutcome } from '@app/storage/practiceMissionHistory';
import { getItem, setItem } from '@app/storage/asyncStorage';
import { safeEmit } from '@app/telemetry';

vi.mock('@app/storage/asyncStorage', () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@app/telemetry', () => ({ safeEmit: vi.fn() }));

describe('practice mission history telemetry', () => {
  const now = new Date('2024-02-08T12:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getItem).mockResolvedValue('[]');
    vi.mocked(setItem).mockResolvedValue();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits a completion event when a mission outcome is recorded', async () => {
    const outcome = {
      missionId: 'practice_fill_gap:pw:8i',
      startedAt: new Date('2024-01-01T10:00:00Z').toISOString(),
      endedAt: new Date('2024-01-01T10:30:00Z').toISOString(),
      targetClubs: ['pw', '8i'],
      targetSampleCount: 10,
      completedSampleCount: 12,
    };

    const result = await recordPracticeMissionOutcome(outcome);

    expect(result).toHaveLength(1);
    expect(vi.mocked(setItem)).toHaveBeenCalled();
    expect(vi.mocked(safeEmit)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(safeEmit)).toHaveBeenCalledWith('practice_mission_complete', {
      missionId: 'practice_fill_gap:pw:8i',
      samplesCount: 12,
    });
    expect(vi.mocked(safeEmit)).not.toHaveBeenCalledWith('practice_goal_reached', expect.anything());
  });

  it('emits a goal reached event when crossing the target for the first time', async () => {
    const history = [
      {
        id: 'e1',
        missionId: 'm1',
        startedAt: '2024-02-05T10:00:00Z',
        endedAt: '2024-02-05T10:20:00Z',
        status: 'completed' as const,
        targetClubs: ['7i'],
        completedSampleCount: 8,
      },
      {
        id: 'e2',
        missionId: 'm2',
        startedAt: '2024-02-06T10:00:00Z',
        endedAt: '2024-02-06T10:20:00Z',
        status: 'completed' as const,
        targetClubs: ['7i'],
        completedSampleCount: 8,
      },
    ];
    vi.mocked(getItem).mockResolvedValue(JSON.stringify(history));

    await recordPracticeMissionOutcome({
      missionId: 'practice_fill_gap:pw:8i',
      startedAt: new Date('2024-02-07T10:00:00Z').toISOString(),
      endedAt: new Date('2024-02-07T10:30:00Z').toISOString(),
      targetClubs: ['pw', '8i'],
      targetSampleCount: 10,
      completedSampleCount: 12,
    });

    expect(vi.mocked(safeEmit)).toHaveBeenCalledWith('practice_goal_reached', {
      goalId: 'weekly_mission_completions',
      targetCompletions: 3,
      completedInWindow: 3,
      windowDays: 7,
      platform: 'mobile',
      source: 'practice_mission',
    });
  });

  it('does not re-emit goal reached when already completed', async () => {
    const history = [
      {
        id: 'e1',
        missionId: 'm1',
        startedAt: '2024-02-03T10:00:00Z',
        endedAt: '2024-02-03T10:20:00Z',
        status: 'completed' as const,
        targetClubs: ['7i'],
        completedSampleCount: 8,
      },
      {
        id: 'e2',
        missionId: 'm2',
        startedAt: '2024-02-04T10:00:00Z',
        endedAt: '2024-02-04T10:20:00Z',
        status: 'completed' as const,
        targetClubs: ['7i'],
        completedSampleCount: 8,
      },
      {
        id: 'e3',
        missionId: 'm3',
        startedAt: '2024-02-06T10:00:00Z',
        endedAt: '2024-02-06T10:20:00Z',
        status: 'completed' as const,
        targetClubs: ['7i'],
        completedSampleCount: 8,
      },
    ];
    vi.mocked(getItem).mockResolvedValue(JSON.stringify(history));

    await recordPracticeMissionOutcome({
      missionId: 'practice_fill_gap:pw:8i',
      startedAt: new Date('2024-02-07T10:00:00Z').toISOString(),
      endedAt: new Date('2024-02-07T10:30:00Z').toISOString(),
      targetClubs: ['pw', '8i'],
      targetSampleCount: 10,
      completedSampleCount: 12,
    });

    expect(vi.mocked(safeEmit)).toHaveBeenCalledWith('practice_mission_complete', {
      missionId: 'practice_fill_gap:pw:8i',
      samplesCount: 12,
    });
    expect(vi.mocked(safeEmit)).not.toHaveBeenCalledWith('practice_goal_reached', expect.anything());
  });
});

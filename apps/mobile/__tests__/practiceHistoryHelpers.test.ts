import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordPracticeMissionOutcome } from '@app/storage/practiceMissionHistory';
import { getItem, setItem } from '@app/storage/asyncStorage';
import { safeEmit } from '@app/telemetry';

vi.mock('@app/storage/asyncStorage', () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@app/telemetry', () => ({ safeEmit: vi.fn() }));

describe('practice mission history telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getItem).mockResolvedValue('[]');
    vi.mocked(setItem).mockResolvedValue();
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
    expect(vi.mocked(safeEmit)).toHaveBeenCalledWith('practice_mission_complete', {
      missionId: 'practice_fill_gap:pw:8i',
      samplesCount: 12,
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as asyncStorage from '@app/storage/asyncStorage';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));
import {
  appendPracticeSessionResultEntry,
  summarizePracticeSessionProgress,
} from '@app/storage/practiceSessionResults';

describe('practiceSessionResultsStorage', () => {
  beforeEach(() => {
    vi.spyOn(asyncStorage, 'getItem').mockResolvedValue(null);
    vi.spyOn(asyncStorage, 'setItem').mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('appends a result to storage', async () => {
    await appendPracticeSessionResultEntry({
      missionId: 'mission-1',
      completedAt: '2024-06-01T12:00:00.000Z',
      shotsAttempted: 10,
    });

    expect(asyncStorage.setItem).toHaveBeenCalled();
  });

  it('summarizes streaks', async () => {
    vi.mocked(asyncStorage.getItem).mockResolvedValueOnce(
      JSON.stringify([
        { missionId: 'mission-1', completedAt: '2024-06-02T12:00:00.000Z', shotsAttempted: 5 },
        { missionId: 'mission-2', completedAt: '2024-06-01T12:00:00.000Z', shotsAttempted: 5 },
      ]),
    );

    const summary = await summarizePracticeSessionProgress(new Date('2024-06-02T18:00:00.000Z'));

    expect(summary.consecutiveDays).toBe(2);
    expect(summary.lastSevenDays).toBe(2);
  });
});

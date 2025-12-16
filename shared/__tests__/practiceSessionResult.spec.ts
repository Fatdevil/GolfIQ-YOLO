import { describe, expect, it } from 'vitest';

import {
  appendPracticeSessionResult,
  clampPracticeSessionResults,
  computePracticeSessionProgress,
  normalizePracticeSessionResult,
  normalizePracticeSessionResults,
  type PracticeSessionResult,
} from '../practice/practiceSessionResult';

describe('practiceSessionResult', () => {
  const base: PracticeSessionResult = {
    missionId: 'mission-1',
    completedAt: '2024-06-01T12:00:00.000Z',
    shotsAttempted: 12,
  };

  it('normalizes valid payloads', () => {
    const result = normalizePracticeSessionResult({ ...base, successRate: 0.8, durationSec: 90 });
    expect(result).toMatchObject({
      missionId: 'mission-1',
      shotsAttempted: 12,
      successRate: 0.8,
      durationSec: 90,
    });
  });

  it('skips invalid entries when normalizing a list', () => {
    const results = normalizePracticeSessionResults([
      base,
      { missionId: '', completedAt: 'bad-date', shotsAttempted: 5 },
    ]);
    expect(results).toHaveLength(1);
  });

  it('appends and clamps to the most recent limit', () => {
    const many = Array.from({ length: 60 }, (_, idx) => ({
      missionId: `mission-${idx}`,
      completedAt: `2024-06-${(idx + 1).toString().padStart(2, '0')}T12:00:00.000Z`,
      shotsAttempted: idx + 1,
    }));
    const clamped = clampPracticeSessionResults(many, 50);
    expect(clamped[0].missionId).toBe('mission-10');
    const appended = appendPracticeSessionResult(clamped, base, 50);
    expect(appended).toHaveLength(50);
    expect(appended[0].missionId).toBe('mission-11');
  });

  it('computes streak and recent counts', () => {
    const now = new Date('2024-06-15T10:00:00.000Z');
    const results: PracticeSessionResult[] = [
      { missionId: 'a', completedAt: '2024-06-15T02:00:00.000Z', shotsAttempted: 5 },
      { missionId: 'b', completedAt: '2024-06-14T03:00:00.000Z', shotsAttempted: 6 },
      { missionId: 'c', completedAt: '2024-06-12T03:00:00.000Z', shotsAttempted: 7 },
      { missionId: 'd', completedAt: '2024-05-30T03:00:00.000Z', shotsAttempted: 8 },
    ];

    const progress = computePracticeSessionProgress(results, now);
    expect(progress.consecutiveDays).toBe(2);
    expect(progress.lastSevenDays).toBe(3);
    expect(progress.lastFourteenDays).toBe(3);
    expect(progress.totalSessions).toBe(4);
    expect(progress.lastCompletedAt).toBe('2024-06-15T02:00:00.000Z');
  });
});

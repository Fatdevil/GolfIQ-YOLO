import { describe, expect, it } from 'vitest';

import {
  buildPracticeDistanceProfile,
  type PracticeDistanceProfileEntry,
  type PracticeDistanceSample,
} from '../caddie/practiceDistanceProfile';

function makeSample(overrides: Partial<PracticeDistanceSample> = {}): PracticeDistanceSample {
  return {
    clubId: '7i',
    avgCarryM: 150,
    sampleCount: 10,
    finishedAt: '2024-01-01T12:00:00Z',
    ...overrides,
  };
}

describe('buildPracticeDistanceProfile', () => {
  it('builds weighted averages per club and marks confidence', () => {
    const profile = buildPracticeDistanceProfile([
      makeSample({ clubId: '7i', avgCarryM: 150, sampleCount: 6 }),
      makeSample({ clubId: '7i', avgCarryM: 162, sampleCount: 6, finishedAt: '2024-01-05T12:00:00Z' }),
      makeSample({ clubId: '8i', avgCarryM: 140, sampleCount: 5 }),
    ]);

    const sevenIron: PracticeDistanceProfileEntry | undefined = profile['7i'];
    const eightIron: PracticeDistanceProfileEntry | undefined = profile['8i'];

    expect(sevenIron?.avgCarryM).toBeCloseTo((150 * 6 + 162 * 6) / 12, 5);
    expect(sevenIron?.sampleCount).toBe(12);
    expect(sevenIron?.confidence).toBe('high');
    expect(eightIron?.confidence).toBe('low');
  });

  it('ignores invalid entries and enforces min sample requirements', () => {
    const profile = buildPracticeDistanceProfile([
      makeSample({ clubId: '7i', sampleCount: 2 }),
      makeSample({ clubId: '7i', sampleCount: 1 }),
      makeSample({ clubId: '', sampleCount: 10 }),
      makeSample({ clubId: '9i', avgCarryM: -10, sampleCount: 10 }),
      makeSample({ clubId: '8i', sampleCount: 4 }),
    ]);

    expect(profile['7i']).toBeUndefined();
    expect(profile['9i']).toBeUndefined();
    expect(profile['8i']?.sampleCount).toBe(4);
  });

  it('respects max age windows when provided', () => {
    const now = new Date('2024-02-01T00:00:00Z');
    const profile = buildPracticeDistanceProfile(
      [
        makeSample({ clubId: '7i', finishedAt: '2024-01-10T00:00:00Z' }),
        makeSample({ clubId: '7i', finishedAt: '2023-10-01T00:00:00Z' }),
      ],
      { maxAgeDays: 60, now },
    );

    expect(profile['7i']?.sampleCount).toBe(10);
    expect(profile['7i']?.avgCarryM).toBe(150);
  });
});


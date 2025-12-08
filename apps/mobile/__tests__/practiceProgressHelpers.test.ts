import { describe, expect, it } from 'vitest';

import { buildPracticeProgressTileModel } from '@app/home/practiceProgressHelpers';
import type { PracticeProgressOverview } from '@app/storage/practiceMissionHistory';

describe('practiceProgressHelpers', () => {
  it('returns null when overview is missing', () => {
    expect(buildPracticeProgressTileModel(null)).toBeNull();
  });

  it('returns get-started state when no sessions', () => {
    const overview: PracticeProgressOverview = {
      totalSessions: 0,
      completedSessions: 0,
      windowDays: 14,
    };

    const model = buildPracticeProgressTileModel(overview);

    expect(model).not.toBeNull();
    expect(model?.hasData).toBe(false);
    expect(model?.completionRatio).toBe(0);
    expect(model?.summaryKey).toBe('practice.progress.getStarted');
    expect(model?.subtitleKey).toBe('practice.progress.subtitleWindow');
    expect(model?.subtitleParams).toEqual({ window: 14 });
  });

  it('maps partial completion to progress ratio and copy key', () => {
    const overview: PracticeProgressOverview = {
      totalSessions: 3,
      completedSessions: 1,
      windowDays: 14,
    };

    const model = buildPracticeProgressTileModel(overview);

    expect(model?.completionRatio).toBeCloseTo(1 / 3);
    expect(model?.summaryKey).toBe('practice.progress.completedSummary');
    expect(model?.summaryParams).toEqual({ completed: 1, total: 3 });
    expect(model?.completedSessions).toBe(1);
    expect(model?.totalSessions).toBe(3);
  });

  it('uses abandoned copy when nothing completed', () => {
    const overview: PracticeProgressOverview = {
      totalSessions: 2,
      completedSessions: 0,
      windowDays: 14,
    };

    const model = buildPracticeProgressTileModel(overview);

    expect(model?.summaryKey).toBe('practice.progress.abandonedOnly');
    expect(model?.completionRatio).toBe(0);
  });

  it('surfaces streak subtitle when streak is active', () => {
    const overview: PracticeProgressOverview = {
      totalSessions: 4,
      completedSessions: 4,
      windowDays: 14,
      streakDays: 3,
    };

    const model = buildPracticeProgressTileModel(overview);

    expect(model?.subtitleKey).toBe('practice.progress.streak');
    expect(model?.subtitleParams).toEqual({ days: 3 });
  });
});

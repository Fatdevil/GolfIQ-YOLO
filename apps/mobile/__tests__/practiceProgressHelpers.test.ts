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
      windowDays: 7,
    };

    const model = buildPracticeProgressTileModel(overview);

    expect(model).not.toBeNull();
    expect(model?.hasData).toBe(false);
    expect(model?.completionRatio).toBe(0);
    expect(model?.completedSessionsLabelKey).toBe('practice.progress.none');
  });

  it('maps partial completion to progress ratio and copy key', () => {
    const overview: PracticeProgressOverview = {
      totalSessions: 3,
      completedSessions: 1,
      windowDays: 7,
    };

    const model = buildPracticeProgressTileModel(overview);

    expect(model?.completionRatio).toBeCloseTo(1 / 3);
    expect(model?.completedSessionsLabelKey).toBe('practice.progress.some');
    expect(model?.completedSessions).toBe(1);
    expect(model?.totalSessions).toBe(3);
  });

  it('uses all-complete copy when every session is completed', () => {
    const overview: PracticeProgressOverview = {
      totalSessions: 2,
      completedSessions: 2,
      windowDays: 7,
    };

    const model = buildPracticeProgressTileModel(overview);

    expect(model?.completionRatio).toBe(1);
    expect(model?.completedSessionsLabelKey).toBe('practice.progress.all');
  });
});

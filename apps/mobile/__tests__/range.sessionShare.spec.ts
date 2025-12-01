import { describe, expect, it } from 'vitest';

import { formatRangeSessionShareText } from '@app/range/rangeSessionShare';

const summary = {
  id: 'session-1',
  startedAt: '2024-01-01T10:00:00.000Z',
  finishedAt: '2024-01-01T10:30:00.000Z',
  club: '7i',
  targetDistanceM: 150,
  trainingGoalText: 'Work on balance',
  shotCount: 20,
  avgCarryM: 148,
  tendency: 'right',
} as const;

describe('formatRangeSessionShareText', () => {
  it('includes goal, club, shots and focus', () => {
    const text = formatRangeSessionShareText(summary, (key, params) => `${key}:${JSON.stringify(params)}`);

    expect(text).toContain('range.sessionDetail.share_text.training_goal');
    expect(text).toContain('range.sessionDetail.share_text.club');
    expect(text).toContain('range.sessionDetail.share_text.shots');
    expect(text).toContain('range.sessionDetail.share_text.focus');
  });
});

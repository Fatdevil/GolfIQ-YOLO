import { describe, expect, it } from 'vitest';

import { rankTopShotsClient } from '@web/features/clips/rankingClient';

describe('rankTopShotsClient recency clamp', () => {
  it('does not award recency for future timestamps', () => {
    const now = new Date('2024-01-10T12:00:00Z').getTime();
    const clips = [
      {
        id: 'past',
        reactions_1min: 0,
        reactions_total: 0,
        sgDelta: 0,
        createdAt: new Date('2024-01-10T11:50:00Z').toISOString(),
      },
      {
        id: 'future',
        reactions_1min: 0,
        reactions_total: 0,
        sgDelta: 0,
        createdAt: new Date('2024-01-10T12:01:00Z').toISOString(),
      },
    ];

    const ranked = rankTopShotsClient(clips, now, { alpha: 0.6, beta: 1.0, gamma: 0.3 });
    const scores = Object.fromEntries(ranked.map((clip) => [clip.id, clip.score]));

    expect(scores.future).toBeDefined();
    expect(scores.future).toBeLessThanOrEqual(scores.past);
    const pastCreated = new Date(clips[0].createdAt ?? '');
    const minutesDelta = (now - pastCreated.getTime()) / 60000;
    const expectedPast = 0.3 * (1 / minutesDelta);
    expect(scores.future).toBeCloseTo(0, 6);
    expect(scores.past).toBeCloseTo(expectedPast, 6);
  });
});

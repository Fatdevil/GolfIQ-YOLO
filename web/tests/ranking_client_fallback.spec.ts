import { describe, expect, it } from 'vitest';

import { rankTopShotsClient } from '@web/features/clips/rankingClient';

describe('rankTopShotsClient', () => {
  it('matches expected ordering for sample dataset', () => {
    const now = new Date('2024-01-10T12:20:00Z').getTime();
    const clips = [
      {
        id: 'clip-a',
        sgDelta: 0.8,
        reactions_1min: 12,
        reactions_total: 40,
        createdAt: '2024-01-10T12:00:00Z',
      },
      {
        id: 'clip-b',
        sgDelta: 1.4,
        reactions_1min: 6,
        reactions_total: 18,
        createdAt: '2024-01-10T12:10:00Z',
      },
      {
        id: 'clip-c',
        sgDelta: -0.2,
        reactions_1min: 14,
        reactions_total: 60,
        createdAt: '2023-12-31T23:50:00Z',
      },
    ];

    const ranked = rankTopShotsClient(clips, now, { alpha: 0.6, beta: 1.0, gamma: 0.3 });
    expect(ranked.map((clip) => clip.id)).toEqual(['clip-c', 'clip-a', 'clip-b']);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThan(ranked[2].score);
  });
});

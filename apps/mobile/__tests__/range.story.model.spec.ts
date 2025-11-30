import { describe, expect, it } from 'vitest';

import { buildRangeSessionStory } from '@app/range/rangeSessionStory';
import type { RangeSessionSummary } from '@app/range/rangeSession';

describe('buildRangeSessionStory', () => {
  const baseSummary: RangeSessionSummary = {
    id: 'session-1',
    startedAt: '2024-01-01T00:00:00.000Z',
    finishedAt: '2024-01-01T01:00:00.000Z',
    club: '7i',
    shotCount: 10,
    avgCarryM: 150,
    targetDistanceM: 148,
    tendency: 'straight',
  };

  it('focuses on direction when distance is solid but tendency drifts', () => {
    const story = buildRangeSessionStory({ ...baseSummary, tendency: 'left' });

    expect(story.focusArea).toBe('direction');
    expect(story.titleKey).toBe('range.story.solid_distance_work_on_direction');
    expect(story.strengths).toContain('range.story.strengths.solid_distance');
    expect(story.improvements).toContain('range.story.improvements.direction');
  });

  it('focuses on distance when start line is straight but carry is off target', () => {
    const story = buildRangeSessionStory({ ...baseSummary, avgCarryM: 120, tendency: 'straight' });

    expect(story.focusArea).toBe('distance');
    expect(story.titleKey).toBe('range.story.good_direction_work_on_distance');
    expect(story.strengths).toContain('range.story.strengths.tight_direction');
    expect(story.improvements).toContain('range.story.improvements.distance');
  });

  it('falls back to contact when there is not enough reliable data', () => {
    const story = buildRangeSessionStory({ ...baseSummary, shotCount: 2, avgCarryM: null });

    expect(story.focusArea).toBe('contact');
    expect(story.titleKey).toBe('range.story.focus_on_contact');
    expect(story.improvements).toContain('range.story.improvements.contact');
    expect(story.strengths.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';

import { buildTempoStory, type TempoStats } from '@app/range/tempoStory';

describe('buildTempoStory', () => {
  const baseStats: TempoStats = {
    avgTempoRatio: 3.0,
    tempoSampleCount: 12,
    minTempoRatio: 2.8,
    maxTempoRatio: 3.1,
  };

  it('returns insufficient data when samples are low', () => {
    const story = buildTempoStory({ avgTempoRatio: 3.0, tempoSampleCount: 4 });

    expect(story.category).toBe('insufficient_data');
    expect(story.titleKey).toBe('range.tempo.story.insufficient_data.title');
  });

  it('classifies stable good tempo within normal band', () => {
    const story = buildTempoStory(baseStats);

    expect(story.category).toBe('stable_good');
    expect(story.titleKey).toBe('range.tempo.story.stable_good.title');
    expect(story.params).toMatchObject({ avg: 3.0, min: 2.8, max: 3.1 });
  });

  it('flags unstable tempo when spread is wide', () => {
    const story = buildTempoStory({ ...baseStats, minTempoRatio: 2.2, maxTempoRatio: 3.0 });

    expect(story.category).toBe('unstable');
    expect(story.titleKey).toBe('range.tempo.story.unstable.title');
  });

  it('surfaces extremely quick tempo when average is very low', () => {
    const story = buildTempoStory({ ...baseStats, avgTempoRatio: 2.2 });

    expect(story.category).toBe('stable_extreme_fast');
    expect(story.titleKey).toBe('range.tempo.story.stable_extreme_fast.title');
  });

  it('surfaces extremely slow tempo when average is very high', () => {
    const story = buildTempoStory({ ...baseStats, avgTempoRatio: 3.9 });

    expect(story.category).toBe('stable_extreme_slow');
    expect(story.titleKey).toBe('range.tempo.story.stable_extreme_slow.title');
  });

  it('defaults to stable bands when spread is missing but averages are solid', () => {
    const story = buildTempoStory({ avgTempoRatio: 3.1, tempoSampleCount: 10 });

    expect(story.category).toBe('stable_good');
  });
});

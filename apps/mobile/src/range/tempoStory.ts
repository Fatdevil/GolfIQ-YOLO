export interface TempoStats {
  avgTempoRatio?: number | null;
  tempoSampleCount?: number | null;
  minTempoRatio?: number | null;
  maxTempoRatio?: number | null;
}

export type TempoStoryCategory =
  | 'stable_good'
  | 'stable_extreme_fast'
  | 'stable_extreme_slow'
  | 'unstable'
  | 'insufficient_data';

export interface TempoStory {
  category: TempoStoryCategory;
  titleKey: string;
  bodyKey: string;
  params?: Record<string, number>;
}

const MIN_SAMPLES = 8;
const STABLE_RANGE_MAX = 0.35;
const UNSTABLE_RANGE_MIN = 0.45;
const NORMAL_MIN = 2.6;
const NORMAL_MAX = 3.4;
const EXTREME_FAST_MAX = 2.4;
const EXTREME_SLOW_MIN = 3.6;

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

function roundTempo(value: number | undefined): number {
  if (!isNumber(value)) return 0;
  return Math.round(value * 10) / 10;
}

export function buildTempoStory(stats: TempoStats): TempoStory {
  const { avgTempoRatio, tempoSampleCount, minTempoRatio, maxTempoRatio } = stats;

  if (!isNumber(avgTempoRatio) || !tempoSampleCount || tempoSampleCount < MIN_SAMPLES) {
    return {
      category: 'insufficient_data',
      titleKey: 'range.tempo.story.insufficient_data.title',
      bodyKey: 'range.tempo.story.insufficient_data.body',
    };
  }

  const hasSpread = isNumber(minTempoRatio) && isNumber(maxTempoRatio);
  const spread = hasSpread ? maxTempoRatio! - minTempoRatio! : null;

  if (isNumber(spread) && spread > UNSTABLE_RANGE_MIN) {
    return {
      category: 'unstable',
      titleKey: 'range.tempo.story.unstable.title',
      bodyKey: 'range.tempo.story.unstable.body',
      params: {
        min: roundTempo(minTempoRatio ?? undefined),
        max: roundTempo(maxTempoRatio ?? undefined),
      },
    };
  }

  const assumedStable = spread == null || spread <= STABLE_RANGE_MAX;
  const params: Record<string, number> = {
    avg: roundTempo(avgTempoRatio),
  };
  if (hasSpread) {
    params.min = roundTempo(minTempoRatio ?? undefined);
    params.max = roundTempo(maxTempoRatio ?? undefined);
  }

  if (avgTempoRatio < EXTREME_FAST_MAX && assumedStable) {
    return {
      category: 'stable_extreme_fast',
      titleKey: 'range.tempo.story.stable_extreme_fast.title',
      bodyKey: 'range.tempo.story.stable_extreme_fast.body',
      params,
    };
  }

  if (avgTempoRatio > EXTREME_SLOW_MIN && assumedStable) {
    return {
      category: 'stable_extreme_slow',
      titleKey: 'range.tempo.story.stable_extreme_slow.title',
      bodyKey: 'range.tempo.story.stable_extreme_slow.body',
      params,
    };
  }

  if (avgTempoRatio >= NORMAL_MIN && avgTempoRatio <= NORMAL_MAX && assumedStable) {
    return {
      category: 'stable_good',
      titleKey: 'range.tempo.story.stable_good.title',
      bodyKey: 'range.tempo.story.stable_good.body',
      params,
    };
  }

  return {
    category: 'unstable',
    titleKey: 'range.tempo.story.unstable.title',
    bodyKey: 'range.tempo.story.unstable.body',
    params,
  };
}

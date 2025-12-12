import type { StrokesGainedLightCategory, StrokesGainedLightSummary } from './strokesGainedLight';
import {
  STROKES_GAINED_LIGHT_MIN_ABSOLUTE_DELTA,
  STROKES_GAINED_LIGHT_MIN_CONFIDENCE,
} from './strokesGainedLight';

export type StrokesGainedLightFocusStatus = 'strong_signal' | 'low_confidence';

export interface StrokesGainedLightFocusCandidate {
  roundId?: string | null;
  finishedAt?: string | number | Date | null;
  strokesGainedLight?: StrokesGainedLightSummary | null;
}

export interface StrokesGainedLightFocusInsight {
  roundId?: string | null;
  focusCategory: StrokesGainedLightCategory;
  labelKey: string;
  confidence: number;
  delta: number;
  status: StrokesGainedLightFocusStatus;
}

const CATEGORY_LABEL_KEYS: Record<StrokesGainedLightCategory, string> = {
  tee: 'sg_light.focus.off_the_tee',
  approach: 'sg_light.focus.approach',
  short_game: 'sg_light.focus.short_game',
  putting: 'sg_light.focus.putting',
};

function parseDate(value?: string | number | Date | null): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const date = value instanceof Date ? value : new Date(value);
  const ts = date.getTime();
  return Number.isFinite(ts) ? ts : null;
}

function resolveFocus(summary?: StrokesGainedLightSummary | null): StrokesGainedLightFocusInsight | null {
  if (!summary?.focusCategory) return null;
  const entry = summary.byCategory?.find((candidate) => candidate.category === summary.focusCategory);
  if (!entry) return null;

  const confidence = entry.confidence ?? 0;
  const status: StrokesGainedLightFocusStatus =
    confidence >= STROKES_GAINED_LIGHT_MIN_CONFIDENCE && entry.delta <= -STROKES_GAINED_LIGHT_MIN_ABSOLUTE_DELTA
      ? 'strong_signal'
      : 'low_confidence';

  if (status === 'low_confidence') {
    return null;
  }

  return {
    focusCategory: summary.focusCategory,
    labelKey: CATEGORY_LABEL_KEYS[summary.focusCategory] ?? summary.focusCategory,
    confidence,
    delta: entry.delta,
    status,
  };
}

export function findLatestStrokesGainedLightFocus(
  candidates: StrokesGainedLightFocusCandidate[],
): StrokesGainedLightFocusInsight | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const sorted = [...candidates]
    .map((candidate) => ({
      candidate,
      finishedAt: parseDate(candidate.finishedAt),
    }))
    .filter((entry) => entry.finishedAt != null)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));

  for (const entry of sorted) {
    const focus = resolveFocus(entry.candidate.strokesGainedLight);
    if (focus) {
      return { ...focus, roundId: entry.candidate.roundId };
    }
  }

  return null;
}

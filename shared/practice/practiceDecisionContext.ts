import type { PracticeReadinessSummary } from './practiceReadiness';
import type { StrokesGainedLightCategory } from '../stats/strokesGainedLight';

export type PracticeFocusArea = 'driving' | 'approach' | 'short_game' | 'putting';

export type PracticeRecommendationSource =
  | 'home'
  | 'range'
  | 'round_recap_sg_light'
  | 'mobile_home_sg_light_focus'
  | 'mobile_stats_sg_light_trend'
  | 'mobile_round_story_sg_light_focus'
  | 'practice_missions'
  | 'other';

export type PracticeDecisionContext = {
  /** Whether the current weekly practice goal has been reached. */
  goalReached: boolean;
  /** Target weekly goal (null when no goal is configured). */
  goalTarget?: number | null;
  /** Current progress toward the active weekly goal. */
  goalProgress?: number | null;
  /** Normalized focus areas practiced most recently. */
  recentFocusAreas: PracticeFocusArea[];
  /** A lightweight confidence proxy derived from recent practice progress (0–1). */
  practiceConfidence: number;
  /** Where the practice flow was launched from. */
  source?: PracticeRecommendationSource | string;
  /** Weakest SG Light category, if available. */
  strokesGainedLightFocusCategory?: StrokesGainedLightCategory;
};

const FOCUS_AREA_MAP: Record<string, PracticeFocusArea> = {
  driving: 'driving',
  drive: 'driving',
  tee_shots: 'driving',
  approach: 'approach',
  irons: 'approach',
  wedges: 'approach',
  short_game: 'short_game',
  chipping: 'short_game',
  pitching: 'short_game',
  putting: 'putting',
  putts: 'putting',
};

function normalizeFocusAreas(focusAreas?: string[] | null): PracticeFocusArea[] {
  if (!Array.isArray(focusAreas)) return [];

  const normalized: PracticeFocusArea[] = [];
  for (const raw of focusAreas) {
    if (typeof raw !== 'string') continue;
    const key = raw.trim().toLowerCase();
    const mapped = FOCUS_AREA_MAP[key];
    if (mapped && !normalized.includes(mapped)) {
      normalized.push(mapped);
    }
  }
  return normalized;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export interface BuildPracticeDecisionContextOptions {
  summary?: PracticeReadinessSummary | null;
  focusAreas?: string[] | null;
  source?: PracticeRecommendationSource | string | null;
  strokesGainedLightFocusCategory?: StrokesGainedLightCategory | null;
}

export function buildPracticeDecisionContext(
  options: BuildPracticeDecisionContextOptions,
): PracticeDecisionContext | null {
  const summary = options.summary ?? null;
  const focusAreas = normalizeFocusAreas(options.focusAreas);

  if (!summary && focusAreas.length === 0) return null;

  const goalTarget = summary?.goalTarget ?? null;
  const goalProgress = summary?.goalProgress ?? null;
  const sessionsCompleted = summary?.sessionsCompleted ?? 0;

  const confidenceFromGoal =
    goalTarget && goalTarget > 0 && goalProgress != null ? goalProgress / goalTarget : null;
  const confidenceFallback = sessionsCompleted / 3;

  const practiceConfidence = clamp01(
    confidenceFromGoal != null && Number.isFinite(confidenceFromGoal)
      ? confidenceFromGoal
      : confidenceFallback,
  );

  const context: PracticeDecisionContext = {
    goalReached: Boolean(summary?.goalReached),
    goalTarget,
    goalProgress,
    recentFocusAreas: focusAreas,
    practiceConfidence,
  };

  if (options.source) {
    context.source = options.source;
  }

  if (options.strokesGainedLightFocusCategory) {
    context.strokesGainedLightFocusCategory = options.strokesGainedLightFocusCategory;
  }

  return context;
}

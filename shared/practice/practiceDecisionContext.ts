import type { PracticeReadinessSummary } from './practiceReadiness';

export type PracticeFocusArea = 'driving' | 'approach' | 'short_game' | 'putting';

export type PracticeDecisionContext = {
  /** Whether the current weekly practice goal has been reached. */
  goalReached: boolean;
  /** Normalized focus areas practiced most recently. */
  recentFocusAreas: PracticeFocusArea[];
  /** A lightweight confidence proxy derived from recent practice progress (0–1). */
  practiceConfidence: number;
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
}

export function buildPracticeDecisionContext(
  options: BuildPracticeDecisionContextOptions,
): PracticeDecisionContext | null {
  const summary = options.summary ?? null;
  const focusAreas = normalizeFocusAreas(options.focusAreas);

  if (!summary && focusAreas.length === 0) return null;

  const goalTarget = summary?.goalTarget ?? null;
  const goalProgress = summary?.goalProgress ?? 0;
  const sessionsCompleted = summary?.sessionsCompleted ?? 0;

  const confidenceFromGoal = goalTarget && goalTarget > 0 ? goalProgress / goalTarget : null;
  const confidenceFallback = sessionsCompleted / 3;

  const practiceConfidence = clamp01(
    confidenceFromGoal != null && Number.isFinite(confidenceFromGoal)
      ? confidenceFromGoal
      : confidenceFallback,
  );

  return {
    goalReached: Boolean(summary?.goalReached),
    recentFocusAreas: focusAreas,
    practiceConfidence,
  };
}

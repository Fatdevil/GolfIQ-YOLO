import type { PlayerProfile, TrainingFocus } from './profile';

export interface FocusScore {
  focus: TrainingFocus;
  score: number;
}

export interface RiskContext {
  hazardDensity?: number;
  planRisk?: number;
}

const TRAINING_FOCUS_VALUES: readonly TrainingFocus[] = [
  'long-drive',
  'tee',
  'approach',
  'wedge',
  'short',
  'putt',
  'recovery',
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function mean(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function sgDeficit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return value < 0 ? -value : 0;
}

function adherencePenalty(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  if (score >= 0.6) {
    return 0;
  }
  return clamp(0.6 - score, 0, 0.4);
}

export function rankFocus(profile: PlayerProfile): FocusScore[] {
  const weights = profile.focusWeights;
  const sgLift = profile.sgLiftByFocus ?? {};
  const adherence = profile.adherenceScore ?? 0.5;
  const penalty = adherencePenalty(adherence);
  const scores = TRAINING_FOCUS_VALUES.map((focus) => {
    const baseWeight = Math.max(0.01, weights[focus] ?? 0);
    const deficit = clamp(sgDeficit(sgLift[focus as keyof typeof sgLift]), 0, 0.6);
    const score = baseWeight * (1 + deficit) * (1 + penalty);
    return { focus, score } satisfies FocusScore;
  });
  return scores.sort((a, b) => b.score - a.score);
}

export function pickAdviceStyle(profile: PlayerProfile): PlayerProfile['style'] {
  return { ...profile.style };
}

export function pickRisk(profile: PlayerProfile, ctx: RiskContext = {}): PlayerProfile['riskPreference'] {
  const adoption = profile.adoptRate ?? 0.5;
  const hazard = clamp(ctx.hazardDensity ?? 0, 0, 1);
  const liftValues = Object.values(profile.sgLiftByFocus ?? {}).filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  const avgLift = mean(liftValues);
  if (hazard >= 0.6 || adoption < 0.35) {
    return 'safe';
  }
  if (avgLift > 0.12 && adoption > 0.6 && profile.adherenceScore > 0.6) {
    return 'aggressive';
  }
  if (profile.riskPreference === 'aggressive' && adoption > 0.55 && hazard < 0.4) {
    return 'aggressive';
  }
  return adoption >= 0.45 ? 'normal' : 'safe';
}

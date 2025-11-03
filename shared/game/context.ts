import { GameContext, RiskMode, defaultGameContext } from './types';

type Listener = (ctx: GameContext) => void;

type StrategyRiskMode = 'safe' | 'normal' | 'aggressive';
type StrategyRiskProfile = 'conservative' | 'neutral' | 'aggressive';

const STRATEGY_RISK_ORDER: readonly StrategyRiskMode[] = ['safe', 'normal', 'aggressive'];
const STRATEGY_PROFILE_ORDER: readonly StrategyRiskProfile[] = [
  'conservative',
  'neutral',
  'aggressive',
];

const clampInt = (value: number | undefined, fallback: number, min = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const truncated = Math.trunc(value);
  if (truncated < min) {
    return min;
  }
  return truncated;
};

const deriveHolesRemaining = (holesTotal: number, holeIndex: number): number => {
  const total = clampInt(holesTotal, defaultGameContext.holesTotal, 1);
  const index = clampInt(holeIndex, defaultGameContext.holeIndex, 0);
  return Math.max(0, total - (index + 1));
};

const scoreDelta = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return value;
};

const deriveRiskMode = (ctx: GameContext): RiskMode => {
  const holesRemaining = clampInt(ctx.holesRemaining, defaultGameContext.holesRemaining);
  const strokesBehind = scoreDelta(ctx.strokesBehind);
  const scoreToPar = scoreDelta(ctx.myScoreToPar);
  const position = clampInt(ctx.position, 0, 0);

  const isTrailing = strokesBehind > 0 || position > 1;
  const isLeading = !isTrailing && position === 1;
  const lateRound = holesRemaining <= 4;
  const midLateRound = holesRemaining <= 6;

  if (isTrailing) {
    if (strokesBehind >= 2 || lateRound) {
      return 'aggressive';
    }
    if (ctx.format === 'match' && holesRemaining <= 3) {
      return 'aggressive';
    }
    return 'balanced';
  }

  if (isLeading) {
    if (lateRound || scoreToPar <= -3) {
      return 'conservative';
    }
  }

  if (midLateRound) {
    if (scoreToPar >= 3) {
      return 'aggressive';
    }
    if (scoreToPar <= -3) {
      return 'conservative';
    }
  }

  if (ctx.format === 'stableford') {
    if (scoreToPar <= -4) {
      return 'conservative';
    }
    if (scoreToPar >= 4) {
      return 'aggressive';
    }
  }

  return 'balanced';
};

class GameContextStore {
  private state: GameContext = defaultGameContext;

  private listeners = new Set<Listener>();

  get(): GameContext {
    return this.state;
  }

  set(patch: Partial<GameContext>): void {
    const nextHolesTotal =
      typeof patch.holesTotal === 'number' && Number.isFinite(patch.holesTotal)
        ? Math.max(1, Math.trunc(patch.holesTotal))
        : this.state.holesTotal;
    const nextHoleIndex =
      typeof patch.holeIndex === 'number' && Number.isFinite(patch.holeIndex)
        ? Math.max(0, Math.trunc(patch.holeIndex))
        : this.state.holeIndex;
    const base: GameContext = {
      ...this.state,
      ...patch,
      holesTotal: nextHolesTotal,
      holeIndex: nextHoleIndex,
    };
    const holesRemaining = deriveHolesRemaining(base.holesTotal, base.holeIndex);
    const next: GameContext = {
      ...base,
      holesRemaining,
    };
    if (!patch.riskMode) {
      next.riskMode = deriveRiskMode({ ...next, riskMode: this.state.riskMode });
    }
    this.state = next;
    this.listeners.forEach((listener) => listener(this.state));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const gameCtxStore = new GameContextStore();

const shiftRiskMode = (mode: StrategyRiskMode, delta: number): StrategyRiskMode => {
  const index = STRATEGY_RISK_ORDER.indexOf(mode);
  if (index < 0) {
    return mode;
  }
  const next = Math.max(0, Math.min(STRATEGY_RISK_ORDER.length - 1, index + delta));
  return STRATEGY_RISK_ORDER[next];
};

export const applyGameRiskBias = (mode: StrategyRiskMode): StrategyRiskMode => {
  const ctx = gameCtxStore.get();
  if (!ctx) {
    return mode;
  }
  if (ctx.riskMode === 'aggressive') {
    return shiftRiskMode(mode, 1);
  }
  if (ctx.riskMode === 'conservative') {
    return shiftRiskMode(mode, -1);
  }
  return mode;
};

const shiftRiskProfile = (profile: StrategyRiskProfile, delta: number): StrategyRiskProfile => {
  const index = STRATEGY_PROFILE_ORDER.indexOf(profile);
  if (index < 0) {
    return profile;
  }
  const next = Math.max(0, Math.min(STRATEGY_PROFILE_ORDER.length - 1, index + delta));
  return STRATEGY_PROFILE_ORDER[next];
};

export const applyGameRiskProfile = (profile: StrategyRiskProfile): StrategyRiskProfile => {
  const ctx = gameCtxStore.get();
  if (!ctx) {
    return profile;
  }
  if (ctx.riskMode === 'aggressive') {
    return shiftRiskProfile(profile, 1);
  }
  if (ctx.riskMode === 'conservative') {
    return shiftRiskProfile(profile, -1);
  }
  return profile;
};

export { deriveRiskMode };

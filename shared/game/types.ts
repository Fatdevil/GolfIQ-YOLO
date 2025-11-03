export type GameFormat = 'stroke' | 'match' | 'stableford';

export type RiskMode = 'conservative' | 'balanced' | 'aggressive';

export type GameContext = {
  format: GameFormat;
  holeIndex: number; // 0-based current hole index
  holesTotal: number; // e.g. 18
  holesRemaining: number; // derived: holesTotal - (holeIndex+1)
  myScoreToPar?: number; // +3, -1 etc. (optional early)
  position?: number; // 1 = leading; optional
  strokesBehind?: number; // positive if behind
  riskMode: RiskMode; // derived dial we use everywhere
};

export const defaultGameContext: GameContext = {
  format: 'stroke',
  holeIndex: 0,
  holesTotal: 18,
  holesRemaining: 17,
  riskMode: 'balanced',
};

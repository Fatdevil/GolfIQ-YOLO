export type WatchHUDStateV1 = {
  v: 1;
  ts: number;
  fmb: { front: number; middle: number; back: number };
  playsLikePct: number;
  wind: { mps: number; deg: number };
  strategy?: {
    profile: 'conservative' | 'neutral' | 'aggressive';
    offset_m: number;
    carry_m: number;
  };
  tournamentSafe: boolean;
};

export type WatchDiag = {
  capability: {
    android: boolean;
    ios: boolean;
  };
  lastSend: {
    ok: boolean;
    ts: number;
    bytes: number;
  };
};

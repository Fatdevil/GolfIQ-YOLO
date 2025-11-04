export type CaddieHint = {
  club: string;
  carry_m: number;
  total_m?: number | null;
  aim?: { dir: 'L' | 'C' | 'R'; offset_m?: number | null } | null;
  risk: 'safe' | 'neutral' | 'aggressive';
  confidence?: number | null;
};

export type CaddieAdviceV1 = {
  club: string;
  carry_m: number;
  aim?: { dir: 'L' | 'C' | 'R'; offset_m?: number } | null;
  risk?: 'safe' | 'neutral' | 'aggressive' | null;
};

export type WatchMsg =
  | { type: 'CADDIE_ADVICE_V1'; advice: CaddieAdviceV1 }
  | { type: 'CADDIE_ACCEPTED_V1'; club: string };

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
  caddie?: CaddieHint;
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
  throttle: {
    windowMs: number;
  };
  trailing: {
    queued: boolean;
    etaAt: number | null;
  };
};

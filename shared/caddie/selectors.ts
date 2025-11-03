export type CaddieHudVM = {
  best: {
    clubId: string;
    carry_m: number;
    total_m?: number | null;
    aim?: { dir: 'L' | 'C' | 'R'; offset_m?: number | null } | null;
    risk: 'safe' | 'neutral' | 'aggressive';
    confidence?: number | null;
  };
  candidates?: Array<{
    risk: 'safe' | 'neutral' | 'aggressive';
    clubId: string;
    carry_m: number;
    sigma_m?: number | null;
    confidence?: number | null;
    aim?: { dir: 'L' | 'C' | 'R'; offset_m?: number | null } | null;
  }>;
  context?: {
    wind_mps?: number;
    elevation_m?: number;
    temp_c?: number;
    hazardLeft?: number;
    hazardRight?: number;
  };
};

export type RootLike = { caddie?: { currentHud?: CaddieHudVM | null } | null } | any;

export const selectCaddieHud = (s: RootLike): CaddieHudVM | null =>
  (s?.caddie?.currentHud ?? null) as CaddieHudVM | null;

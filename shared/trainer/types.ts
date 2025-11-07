export type GoldenMetricKey =
  | 'startLine'
  | 'faceToPathIdx'
  | 'tempo'
  | 'lowPointSign'
  | 'launchProxy'
  | 'dynLoftProxy';

export type GoldenMetric = {
  key: GoldenMetricKey;
  value: number;
  label: string;
  unit?: string;
  quality: 'good' | 'ok' | 'poor';
  sampleCount?: number;
};

export type GoldenSnapshot = {
  ts: number;
  club?: string;
  metrics: GoldenMetric[];
};

export type GoldenDrillTile = {
  key: GoldenMetricKey;
  label: string;
  unit?: string;
  quality: 'good' | 'ok' | 'poor';
  today: number | null;
  ema: number | null;
  delta: number | null;
  target: { min: number; max: number } | null;
  quickDrills: string[];
  samples: number;
};

export type WeeklyPlan = {
  focus: GoldenMetricKey[];
  sessions: Array<{
    title: string;
    drills: string[];
    targetNotes: string[];
  }>;
};

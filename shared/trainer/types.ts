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
};

export type GoldenSnapshot = {
  ts: number;
  club?: string;
  metrics: GoldenMetric[];
};

export type WeeklyPlan = {
  focus: GoldenMetricKey[];
  sessions: Array<{
    title: string;
    drills: string[];
    targetNotes: string[];
  }>;
};

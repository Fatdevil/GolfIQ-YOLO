export interface TelemetrySample {
  id: string;
  sessionId: string;
  timestamp: string;
  metric: string;
  value: number;
  deviceClass: string;
  sampled: boolean;
}

export interface TelemetryBatch {
  samples: TelemetrySample[];
}
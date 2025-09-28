export type MetricName =
  | "session_count"
  | "session_duration_s"
  | "fps_avg"
  | "fps_p10"
  | "hud_latency_ms_p50"
  | "hud_latency_ms_p90"
  | "tracking_quality_p50"
  | "anchor_resets_count"
  | "thermal_warnings_count"
  | "fallback_events_count";

export interface MetricRecord {
  name: MetricName;
  value: number;
  deviceClass: string;
  sampled: boolean;
}

export class TelemetryMetrics {
  private records: MetricRecord[] = [];

  emit(record: MetricRecord): void {
    this.records.push(record);
  }

  all(): MetricRecord[] {
    return [...this.records];
  }
}
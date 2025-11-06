import type { GoldenMetric } from '../trainer/types';

type TelemetryEmitter = (event: string, payload: Record<string, unknown>) => void;

type SnapshotPayload = {
  club?: string;
  metrics: Array<Pick<GoldenMetric, 'key' | 'value' | 'quality'>>;
  ts?: number;
};

type CameraAssistantPayload = {
  levelDeg: number;
  framingHint: string;
  score: 'good' | 'ok' | 'poor';
  club?: string;
};

function safeEmit(
  emitter: TelemetryEmitter | null | undefined,
  event: string,
  payload: Record<string, unknown>,
): void {
  if (typeof emitter !== 'function') {
    return;
  }
  try {
    emitter(event, payload);
  } catch {
    // ignore telemetry failures
  }
}

export function emitTrainerSnapshot(
  emitter: TelemetryEmitter | null | undefined,
  payload: SnapshotPayload,
): void {
  if (!payload || !Array.isArray(payload.metrics) || payload.metrics.length === 0) {
    return;
  }
  safeEmit(emitter, 'trainer.snapshot.v1', {
    club: payload.club ?? null,
    metrics: payload.metrics.map((metric) => ({
      key: metric.key,
      value: metric.value,
      quality: metric.quality,
    })),
    ts: payload.ts ?? Date.now(),
  });
}

export function emitTrainerCameraAssistant(
  emitter: TelemetryEmitter | null | undefined,
  payload: CameraAssistantPayload,
): void {
  if (!payload) {
    return;
  }
  safeEmit(emitter, 'trainer.camera.assistant', {
    levelDeg: payload.levelDeg,
    framingHint: payload.framingHint,
    score: payload.score,
    club: payload.club ?? null,
    ts: Date.now(),
  });
}

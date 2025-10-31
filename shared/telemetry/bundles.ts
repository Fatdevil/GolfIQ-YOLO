import type { BundleStatus } from '../bundles/types';

export type BundleTelemetryPayload = {
  courseId: string;
  result: BundleStatus;
  bytes?: number;
  etag?: string;
  ttlSec?: number;
  tookMs: number;
};

export type BundleTelemetryEmitter = (event: string, payload: Record<string, unknown>) => void;

export function emitBundleTelemetry(
  emitter: BundleTelemetryEmitter | null | undefined,
  payload: BundleTelemetryPayload,
  options?: { enabled?: boolean },
): void {
  if (!options?.enabled) {
    return;
  }
  if (typeof emitter !== 'function') {
    return;
  }
  try {
    emitter('bundles.qa.v1', payload);
  } catch {
    // ignore telemetry failures
  }
}

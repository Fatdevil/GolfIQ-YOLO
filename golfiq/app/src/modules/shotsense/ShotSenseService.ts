import { ShotDetector } from '../../../../../shared/shotsense/detector';
import type { GpsContext, ShotSenseEvent } from '../../../../../shared/shotsense/types';
import type { IMUBatchV1 } from '../../../../../shared/shotsense/dto';
import { unpackIMUBatch } from '../../../../../shared/shotsense/dto';

export type ShotSenseListener = (event: ShotSenseEvent) => void;

class ShotSenseService {
  private detector: ShotDetector;
  private sampleHz: number;
  private readonly listeners = new Set<ShotSenseListener>();
  private enabled = true;

  constructor(initialHz = 50) {
    this.sampleHz = Math.max(1, Math.round(initialHz));
    this.detector = new ShotDetector({ sampleHz: this.sampleHz });
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    if (!enabled) {
      this.detector.reset();
    }
  }

  reset(): void {
    this.detector.reset();
  }

  pushIMUBatch(batch: IMUBatchV1): void {
    if (!this.enabled || !batch || batch.v !== 1 || !Array.isArray(batch.frames)) {
      return;
    }
    const hz = Number.isFinite(batch.hz) ? Math.max(1, Math.round(batch.hz)) : this.sampleHz;
    this.ensureDetector(hz);
    let events: ShotSenseEvent[] = [];
    try {
      const frames = unpackIMUBatch(batch);
      for (const frame of frames) {
        const nextEvents = this.detector.pushIMU(frame);
        if (nextEvents.length) {
          events = events.concat(nextEvents);
        }
      }
    } catch (error) {
      console.warn('[ShotSenseService] failed to unpack IMU batch', error);
      return;
    }
    if (events.length) {
      for (const event of events) {
        this.emit(event);
      }
    }
  }

  pushGPS(ctx: GpsContext): void {
    if (!this.enabled) {
      return;
    }
    try {
      this.detector.pushGPS(ctx);
    } catch (error) {
      console.warn('[ShotSenseService] failed to process GPS update', error);
    }
  }

  addListener(listener: ShotSenseListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private ensureDetector(sampleHz: number): void {
    if (Math.abs(sampleHz - this.sampleHz) < 1) {
      return;
    }
    this.sampleHz = sampleHz;
    this.detector = new ShotDetector({ sampleHz: this.sampleHz });
  }

  private emit(event: ShotSenseEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn('[ShotSenseService] listener failed', error);
      }
    }
    if (__DEV__) {
      console.log('[ShotSenseService] event', event);
    }
  }
}

export const shotSense = new ShotSenseService();

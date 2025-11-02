import { unpackIMUBatch, type IMUBatchV1 } from '../../../../shared/shotsense/dto';
import { ShotDetector } from '../../../../shared/shotsense/detector';
import type { GpsContext } from '../../../../shared/shotsense/types';

type ShotSenseListener = (ts: number, strength: number) => void;

const MAX_QUEUE_SIZE = 6;

export class ShotSenseService {
  private readonly detector = new ShotDetector();
  private readonly listeners: ShotSenseListener[] = [];
  private readonly queue: IMUBatchV1[] = [];
  private draining = false;

  pushIMUBatch(batch: IMUBatchV1 | null | undefined): void {
    if (!batch || batch.v !== 1) {
      return;
    }

    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift();
      console.warn('[ShotSense] dropping oldest IMU batch (queue full)');
    }

    this.queue.push(batch);

    if (__DEV__) {
      console.log('[ShotSense] queued IMU batch', {
        frames: batch.frames.length,
        hz: batch.hz,
        t0: batch.t0,
        queue: this.queue.length,
      });
    }

    this.drain();
  }

  pushGPS(ctx: GpsContext): void {
    try {
      this.detector.pushGPS(ctx);
      if (__DEV__) {
        console.log('[ShotSense] gps', ctx);
      }
    } catch (error) {
      console.warn('[ShotSense] failed to process GPS context', error);
    }
  }

  onDetect(listener: ShotSenseListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private drain(): void {
    if (this.draining) {
      return;
    }

    this.draining = true;
    try {
      while (this.queue.length) {
        const nextBatch = this.queue.shift();
        if (!nextBatch) {
          continue;
        }

        let framesCount = 0;
        try {
          const frames = unpackIMUBatch(nextBatch);
          framesCount = frames.length;
          if (__DEV__) {
            console.log('[ShotSense] draining IMU batch', {
              frames: frames.length,
              hz: nextBatch.hz,
              queue: this.queue.length,
            });
          }
          for (const frame of frames) {
            const events = this.detector.pushIMU(frame);
            if (!events.length) {
              continue;
            }
            for (const event of events) {
              const { ts, strength } = event.at;
              if (__DEV__) {
                console.log('[ShotSense] detector candidate', ts, strength);
              }
              this.emit(ts, strength);
            }
          }
        } catch (error) {
          console.warn('[ShotSense] failed to unpack IMU batch', error);
          if (__DEV__) {
            console.log('[ShotSense] batch frames count (pre-error)', framesCount);
          }
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private emit(ts: number, strength: number): void {
    for (const listener of this.listeners) {
      try {
        listener(ts, strength);
      } catch (error) {
        console.warn('[ShotSense] listener error', error);
      }
    }
  }
}

export const shotSense = new ShotSenseService();

import { unpackIMUBatch, type IMUBatchV1 } from '../../../../shared/shotsense/dto';
import { ShotDetector } from '../../../../shared/shotsense/detector';
import type { GpsContext } from '../../../../shared/shotsense/types';
import { autoQueue } from './AutoCaptureQueue';
import { getFollowContext } from '../follow/context';

type AckKind = 'pending' | 'confirmed';

type AckSender = (kind: AckKind) => void;

let cachedAckSender: AckSender | null | undefined;

function resolveAckSender(): AckSender | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bridge = require('../watch/bridge');
    if (bridge && typeof bridge.sendShotSenseAck === 'function') {
      return bridge.sendShotSenseAck as AckSender;
    }
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[ShotSense] ack sender unavailable', error);
    }
  }
  return null;
}

function sendAck(kind: AckKind): void {
  if (cachedAckSender === undefined) {
    cachedAckSender = resolveAckSender();
  }
  try {
    cachedAckSender?.(kind);
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[ShotSense] failed to send ack to watch', error);
    }
  }
}

type ShotSenseListener = (ts: number, strength: number) => void;

const MAX_QUEUE_SIZE = 6;
const HZ_TOL = 1;
const HOLE_DEDUPE_MS = 2000;

export class ShotSenseService {
  private detector: ShotDetector;
  private readonly listeners: ShotSenseListener[] = [];
  private readonly queue: IMUBatchV1[] = [];
  private draining = false;
  private currentHz = 80;
  private lastHoleShot: { holeId: number; ts: number } | null = null;

  hapticsAck?: (kind: AckKind) => void;

  constructor() {
    this.detector = new ShotDetector({ sampleHz: this.currentHz });
  }

  pushIMUBatch(batch: IMUBatchV1 | null | undefined): void {
    if (!batch || batch.v !== 1) {
      return;
    }

    this.ensureDetectorHz(batch.hz);

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
              const follow = getFollowContext();
              if (!follow || !Number.isFinite(follow.holeId)) {
                continue;
              }
              if (
                this.lastHoleShot &&
                this.lastHoleShot.holeId === follow.holeId &&
                Math.abs(ts - this.lastHoleShot.ts) < HOLE_DEDUPE_MS
              ) {
                continue;
              }
              autoQueue.enqueue({
                ts,
                strength,
                holeId: follow.holeId,
                start: follow.pos,
                lie: follow.onTee ? 'Tee' : follow.lie ?? 'Fairway',
              });
              this.lastHoleShot = { holeId: follow.holeId, ts };
              try {
                this.hapticsAck?.('pending');
              } catch (error) {
                if (__DEV__) {
                  console.warn('[ShotSense] haptics ack failed', error);
                }
              }
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

  private ensureDetectorHz(hz: number | null | undefined): void {
    if (!Number.isFinite(hz)) {
      return;
    }

    const next = Math.round(hz as number);
    if (Math.abs(next - this.currentHz) <= HZ_TOL) {
      return;
    }

    this.currentHz = next;
    if (typeof (this.detector as any).setSampleHz === 'function') {
      this.detector.setSampleHz(this.currentHz);
    } else {
      this.detector = new ShotDetector({ sampleHz: this.currentHz });
    }

    if (__DEV__) {
      console.log('[ShotSense] detector hz ->', this.currentHz);
    }
  }
}

export const shotSense = new ShotSenseService();

shotSense.hapticsAck = sendAck;

import { AutoDetectedShot } from '../../../../shared/shotsense/types';
import { recordAutoEvent } from '../../../../shared/telemetry/shotsense';
type Listener = (evt: { type: 'enqueue' | 'clear' | 'confirm' | 'dismiss'; shot?: AutoDetectedShot }) => void;

const DEDUPE_MS = 1200;
const TTL_MS = 15000;

export class AutoCaptureQueue {
  private current: AutoDetectedShot | undefined;
  private listeners: Listener[] = [];
  private lastAcceptedShotTs = Number.NEGATIVE_INFINITY;
  private ttlTimer: ReturnType<typeof setTimeout> | null = null;

  on(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    };
  }

  private emit(event: Parameters<Listener>[0]): void {
    if (event.type === 'enqueue' || event.type === 'confirm' || event.type === 'dismiss') {
      recordAutoEvent({ kind: event.type, strength: event.shot?.strength });
    }
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('[AutoCaptureQueue] listener error', error);
        }
      }
    });
  }

  enqueue(shot: Omit<AutoDetectedShot, 'source'>): void {
    if (shot.ts - this.lastAcceptedShotTs < DEDUPE_MS) {
      return;
    }
    this.lastAcceptedShotTs = shot.ts;
    const currentShot: AutoDetectedShot = { ...shot, source: 'auto' };
    this.current = currentShot;
    if (this.ttlTimer) {
      clearTimeout(this.ttlTimer);
    }
    this.ttlTimer = setTimeout(() => this.clear(), TTL_MS);
    this.emit({ type: 'enqueue', shot: this.current });
  }

  currentShot(): AutoDetectedShot | undefined {
    return this.current;
  }

  confirm(patch?: Partial<AutoDetectedShot>): void {
    if (!this.current) {
      return;
    }
    const nextShot: AutoDetectedShot = { ...this.current, ...patch, source: 'auto' };
    this.emit({ type: 'confirm', shot: nextShot });
    this.clear();
  }

  dismiss(): void {
    if (!this.current) {
      return;
    }
    this.emit({ type: 'dismiss', shot: this.current });
    this.clear();
  }

  clear(): void {
    if (!this.current) {
      return;
    }
    this.current = undefined;
    if (this.ttlTimer) {
      clearTimeout(this.ttlTimer);
      this.ttlTimer = null;
    }
    this.emit({ type: 'clear' });
  }
}

export const autoQueue = new AutoCaptureQueue();

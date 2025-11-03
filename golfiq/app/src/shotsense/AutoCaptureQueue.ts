import { AutoDetectedShot } from '../../../../shared/shotsense/types';
import { recordAutoEvent } from '../../../../shared/telemetry/shotsense';
type Listener = (evt: { type: 'enqueue' | 'clear' | 'confirm' | 'dismiss'; shot?: AutoDetectedShot }) => void;

const DEDUPE_MS = 1200;
const TTL_MS = 15000;

export type AcceptedAutoShot = {
  holeId: number;
  ts: number;
  club?: string;
  start?: { lat: number; lon: number; ts: number };
  lie?: AutoDetectedShot['lie'];
  source: 'auto';
};

export class AutoCaptureQueue {
  private current: AutoDetectedShot | undefined;
  private listeners: Listener[] = [];
  private lastAcceptedShotTs = Number.NEGATIVE_INFINITY;
  private ttlTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly acceptedByHole = new Map<number, AcceptedAutoShot[]>();
  private readonly reviewedHoles = new Set<number>();

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

  confirm(patch?: Partial<AutoDetectedShot> & { club?: string }): void {
    if (!this.current) {
      return;
    }
    const nextShot: AutoDetectedShot = { ...this.current, ...patch, source: 'auto' };
    const start = nextShot.start;
    const accepted: AcceptedAutoShot = {
      holeId: nextShot.holeId,
      ts: nextShot.ts,
      club: (patch as { club?: string } | undefined)?.club,
      start: start ? { lat: start.lat, lon: start.lon, ts: nextShot.ts } : undefined,
      lie: nextShot.lie,
      source: 'auto',
    };
    const bucket = this.acceptedByHole.get(accepted.holeId) ?? [];
    bucket.push(accepted);
    this.acceptedByHole.set(accepted.holeId, bucket);
    this.reviewedHoles.delete(accepted.holeId);
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

  getAcceptedShots(holeId: number): AcceptedAutoShot[] {
    if (this.reviewedHoles.has(holeId)) {
      return [];
    }
    const items = this.acceptedByHole.get(holeId) ?? [];
    return items.map((item) => ({
      holeId: item.holeId,
      ts: item.ts,
      club: item.club,
      start: item.start ? { ...item.start } : undefined,
      lie: item.lie,
      source: 'auto',
    }));
  }

  finalizeHole(holeId: number): void {
    this.acceptedByHole.delete(holeId);
    this.reviewedHoles.add(holeId);
  }

  markHoleReviewed(holeId: number): void {
    this.acceptedByHole.delete(holeId);
    this.reviewedHoles.add(holeId);
  }
}

export const autoQueue = new AutoCaptureQueue();

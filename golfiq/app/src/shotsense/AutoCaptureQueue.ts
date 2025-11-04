import { AutoDetectedShot } from '../../../../shared/shotsense/types';
import { recordAutoEvent } from '../../../../shared/telemetry/shotsense';

declare const __DEV__: boolean | undefined;
type Listener = (evt: { type: 'enqueue' | 'clear' | 'confirm' | 'dismiss'; shot?: AutoDetectedShot }) => void;

const DEDUPE_MS = 1200;
const TTL_MS = 15000;

function ensureId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[AutoCaptureQueue] randomUUID failed, falling back', error);
    }
  }
  return `auto-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export type AcceptedAutoShot = {
  id: string;
  holeId: number;
  ts: number;
  club?: string;
  start?: { lat: number; lon: number; ts: number };
  lie?: AutoDetectedShot['lie'];
  playsLikePct?: number;
  source: 'auto';
};

type StoredAcceptedShot = {
  shot: AcceptedAutoShot;
  finalized: boolean;
};

export class AutoCaptureQueue {
  private current: AutoDetectedShot | undefined;
  private listeners: Listener[] = [];
  private lastAcceptedShotTs = Number.NEGATIVE_INFINITY;
  private ttlTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly acceptedByHole = new Map<number, StoredAcceptedShot[]>();
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

  confirm(patch?: Partial<AutoDetectedShot> & { club?: string; playsLikePct?: number }): void {
    if (!this.current) {
      return;
    }
    const nextShot: AutoDetectedShot = { ...this.current, ...patch, source: 'auto' };
    const start = nextShot.start;
    const accepted: AcceptedAutoShot = {
      id: ensureId(),
      holeId: nextShot.holeId,
      ts: nextShot.ts,
      club: (patch as { club?: string } | undefined)?.club,
      start: start ? { lat: start.lat, lon: start.lon, ts: nextShot.ts } : undefined,
      lie: nextShot.lie,
      playsLikePct:
        Number.isFinite((patch as { playsLikePct?: number } | undefined)?.playsLikePct ?? Number.NaN)
          ? Number((patch as { playsLikePct?: number } | undefined)?.playsLikePct)
          : undefined,
      source: 'auto',
    };
    const bucket = this.acceptedByHole.get(accepted.holeId) ?? [];
    bucket.push({ shot: accepted, finalized: false });
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
    return items
      .filter((item) => !item.finalized)
      .map((item) => ({
        id: item.shot.id,
        holeId: item.shot.holeId,
        ts: item.shot.ts,
        club: item.shot.club,
        start: item.shot.start ? { ...item.shot.start } : undefined,
        lie: item.shot.lie,
        playsLikePct: item.shot.playsLikePct,
        source: 'auto',
      }));
  }

  finalizeShot(holeId: number, shotId: string): void {
    const bucket = this.acceptedByHole.get(holeId);
    if (!bucket || !bucket.length) {
      return;
    }
    let pending = 0;
    let updated = false;
    for (const entry of bucket) {
      if (!entry.finalized) {
        if (entry.shot.id === shotId) {
          entry.finalized = true;
          updated = true;
        }
      }
      if (!entry.finalized) {
        pending += 1;
      }
    }
    if (updated && pending === 0) {
      this.acceptedByHole.delete(holeId);
      this.reviewedHoles.add(holeId);
      return;
    }
    if (updated) {
      this.acceptedByHole.set(holeId, bucket);
    }
  }

  finalizeHole(holeId: number): void {
    const bucket = this.acceptedByHole.get(holeId);
    if (bucket) {
      bucket.forEach((entry) => {
        entry.finalized = true;
      });
      this.acceptedByHole.delete(holeId);
    }
    this.reviewedHoles.add(holeId);
  }

  markHoleReviewed(holeId: number): void {
    const bucket = this.acceptedByHole.get(holeId);
    if (bucket) {
      bucket.forEach((entry) => {
        entry.finalized = true;
      });
      this.acceptedByHole.delete(holeId);
    }
    this.reviewedHoles.add(holeId);
  }
}

export const autoQueue = new AutoCaptureQueue();

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

type PrefillState = { club: string; token: number };

const sanitizeClub = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export class AutoCaptureQueue {
  private current: AutoDetectedShot | undefined;
  private listeners: Listener[] = [];
  private lastAcceptedShotTs = Number.NEGATIVE_INFINITY;
  private ttlTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly acceptedByHole = new Map<number, StoredAcceptedShot[]>();
  private readonly reviewedHoles = new Set<number>();
  private watchPrefill: PrefillState | null = null;
  private currentPrefill: PrefillState | null = null;
  private nextPrefillToken = 1;

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

  prefillClub(club: string | null | undefined): PrefillState | null {
    const sanitized = sanitizeClub(club);
    if (!sanitized) {
      return null;
    }
    const token = this.nextPrefillToken++;
    const state: PrefillState = { club: sanitized, token };
    this.watchPrefill = state;
    this.currentPrefill = this.current ? { ...state } : null;
    return state;
  }

  clearPrefill(token: number | null | undefined): boolean {
    const normalized = Number(token);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return false;
    }
    const matchesWatch = this.watchPrefill?.token === normalized;
    const matchesCurrent = this.currentPrefill?.token === normalized;
    if (!matchesWatch && !matchesCurrent) {
      return false;
    }
    if (matchesWatch) {
      this.watchPrefill = null;
    }
    if (matchesCurrent) {
      this.currentPrefill = null;
    }
    return true;
  }

  private consumePrefill(token: number | null | undefined): void {
    const normalized = Number(token);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return;
    }
    if (this.watchPrefill?.token === normalized) {
      this.watchPrefill = null;
    }
    if (this.currentPrefill?.token === normalized) {
      this.currentPrefill = null;
    }
  }

  enqueue(shot: Omit<AutoDetectedShot, 'source'>): void {
    if (shot.ts - this.lastAcceptedShotTs < DEDUPE_MS) {
      return;
    }
    this.lastAcceptedShotTs = shot.ts;
    const currentShot: AutoDetectedShot = { ...shot, source: 'auto' };
    this.current = currentShot;
    this.currentPrefill = this.watchPrefill ? { ...this.watchPrefill } : null;
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
    const patchClub = sanitizeClub((patch as { club?: string } | undefined)?.club ?? null) ?? undefined;
    const fallbackClub =
      patchClub ?? this.currentPrefill?.club ?? this.watchPrefill?.club ?? undefined;
    const appliedPrefillToken =
      !patchClub && fallbackClub ? this.currentPrefill?.token ?? this.watchPrefill?.token ?? null : null;
    const accepted: AcceptedAutoShot = {
      id: ensureId(),
      holeId: nextShot.holeId,
      ts: nextShot.ts,
      club: fallbackClub,
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
    if (appliedPrefillToken) {
      this.consumePrefill(appliedPrefillToken);
    }
    this.currentPrefill = null;
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
    const hadCurrent = Boolean(this.current);
    this.current = undefined;
    this.currentPrefill = null;
    if (this.ttlTimer) {
      clearTimeout(this.ttlTimer);
      this.ttlTimer = null;
    }
    if (hadCurrent) {
      this.emit({ type: 'clear' });
    }
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

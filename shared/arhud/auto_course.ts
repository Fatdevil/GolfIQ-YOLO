import { toLocalENU } from './geo';
import type { BundleIndexEntry } from './bundle_client';
import type { LocationFix } from './location';

export type AutoCourseCandidate = {
  courseId: string;
  dist_m: number;
  name?: string;
};

export type AutoCourseDecision = {
  candidate: AutoCourseCandidate | null;
  shouldPrompt: boolean;
};

export const PROMPT_DISTANCE_THRESHOLD_M = 1_500;
export const HYSTERESIS_MIN_GAIN_M = 300;
export const DEFAULT_DEBOUNCE_MS = 10_000;
export const DISMISS_DURATION_MS = 10 * 60 * 1000;

type NowFn = () => number;

type AutoCourseOptions = {
  debounceMs?: number;
  now?: NowFn;
};

type BundleBBox = [number, number, number, number];

type AutoPickTelemetrySink = (payload: Record<string, unknown>) => void;

type GlobalTelemetry = typeof globalThis & {
  __ARHUD_BUNDLE_FETCH_LOG__?: AutoPickTelemetrySink;
};

function getGlobalTelemetrySink(): AutoPickTelemetrySink | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  const holder = globalThis as GlobalTelemetry;
  const candidate = holder.__ARHUD_BUNDLE_FETCH_LOG__;
  return typeof candidate === 'function' ? candidate : null;
}

function emitTelemetry(courseId: string, dist_m: number): void {
  const sink = getGlobalTelemetrySink();
  const payload = {
    event: 'bundle.autopick',
    id: courseId,
    dist_m,
    timestamp: Date.now(),
  };
  if (sink) {
    try {
      sink(payload);
      return;
    } catch (error) {
      // ignore telemetry errors
    }
  }
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[bundle.autopick]', payload);
  }
}

function normalizeBBox(bbox: unknown): BundleBBox | null {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return null;
  }
  const values = bbox.map((value) => Number(value));
  if (values.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const [minLon, minLat, maxLon, maxLat] = values as BundleBBox;
  if (minLon > maxLon || minLat > maxLat) {
    return null;
  }
  return [minLon, minLat, maxLon, maxLat];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function distanceToBBox(fix: LocationFix, bbox: BundleBBox): number {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const inside =
    fix.lat >= minLat &&
    fix.lat <= maxLat &&
    fix.lon >= minLon &&
    fix.lon <= maxLon;
  if (inside) {
    return 0;
  }
  const clampedLat = clamp(fix.lat, minLat, maxLat);
  const clampedLon = clamp(fix.lon, minLon, maxLon);
  const nearest = { lat: clampedLat, lon: clampedLon };
  const local = toLocalENU({ lat: fix.lat, lon: fix.lon }, nearest);
  return Math.hypot(local.x, local.y);
}

export function pickNearest(index: BundleIndexEntry[], fix: LocationFix | null): AutoCourseCandidate | null {
  if (!fix || !Array.isArray(index) || index.length === 0) {
    return null;
  }
  let best: AutoCourseCandidate | null = null;
  for (const entry of index) {
    if (!entry || typeof entry.courseId !== 'string') {
      continue;
    }
    const bbox = normalizeBBox(entry.bbox);
    if (!bbox) {
      continue;
    }
    const dist = distanceToBBox(fix, bbox);
    if (!best || dist < best.dist_m) {
      best = {
        courseId: entry.courseId,
        dist_m: dist,
        name: typeof entry.name === 'string' ? entry.name : undefined,
      };
    }
  }
  return best;
}

export class AutoCourseController {
  private lastCandidate: AutoCourseCandidate | null = null;

  private lastConsideredAt = 0;

  private readonly debounceMs: number;

  private readonly now: NowFn;

  private dismissedUntil = 0;

  private readonly lastDistances = new Map<string, number>();

  constructor(options?: AutoCourseOptions) {
    this.debounceMs = Math.max(0, options?.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    this.now = options?.now ?? (() => Date.now());
  }

  consider(
    index: BundleIndexEntry[],
    fix: LocationFix | null,
    currentCourseId: string | null,
  ): AutoCourseDecision {
    const nowTs = this.now();
    if (nowTs - this.lastConsideredAt < this.debounceMs) {
      return { candidate: this.lastCandidate, shouldPrompt: false };
    }
    this.lastConsideredAt = nowTs;
    const candidate = pickNearest(index, fix);
    this.lastCandidate = candidate;
    if (!candidate) {
      return { candidate: null, shouldPrompt: false };
    }
    const prevDist = this.lastDistances.get(candidate.courseId) ?? Number.POSITIVE_INFINITY;
    this.lastDistances.set(candidate.courseId, candidate.dist_m);
    if (this.dismissedUntil > nowTs) {
      return { candidate, shouldPrompt: false };
    }
    if (!currentCourseId) {
      if (candidate.dist_m < PROMPT_DISTANCE_THRESHOLD_M) {
        return { candidate, shouldPrompt: true };
      }
      return { candidate, shouldPrompt: false };
    }
    if (candidate.courseId === currentCourseId) {
      return { candidate, shouldPrompt: false };
    }
    if (candidate.dist_m >= PROMPT_DISTANCE_THRESHOLD_M) {
      return { candidate, shouldPrompt: false };
    }
    if (prevDist - candidate.dist_m <= HYSTERESIS_MIN_GAIN_M) {
      return { candidate, shouldPrompt: false };
    }
    return { candidate, shouldPrompt: true };
  }

  recordDismiss(): void {
    this.dismissedUntil = this.now() + DISMISS_DURATION_MS;
  }

  recordSwitch(courseId: string, dist_m: number): void {
    this.lastDistances.set(courseId, dist_m);
    this.dismissedUntil = 0;
    emitTelemetry(courseId, dist_m);
  }

  reset(): void {
    this.lastCandidate = null;
    this.lastDistances.clear();
    this.lastConsideredAt = 0;
    this.dismissedUntil = 0;
  }

  getDebounceMs(): number {
    return this.debounceMs;
  }
}

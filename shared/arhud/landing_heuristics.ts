import type { CourseBundle } from './bundle_client';
import { toLocalENU, type GeoPoint, type LocalPoint } from './geo';
import {
  createSpeedAverageFilter,
  distanceMeters,
  estimateSpeedMps,
  type LocationFix,
  type SpeedAverageFilter,
} from './location';

const EARTH_RADIUS_M = 6_378_137;

export type LandingState = 'IDLE' | 'TRACKING' | 'PROPOSED' | 'CONFIRMED' | 'CANCELLED';

export type LandingSample = {
  t: number;
  lat: number;
  lon: number;
  acc_m: number;
  speed_mps: number;
  heading_deg: number;
};

export type LandingCandidate = { lat: number; lon: number };

export type LandingProposal = {
  candidate: LandingCandidate;
  carry_m: number;
  reason: string;
  conf: number;
};

export type LandingCourseContext = {
  bundle: CourseBundle | null;
  origin: GeoPoint | null;
};

export type LandingHeuristicsOptions = {
  speedThresholdMps?: number;
  stillDurationMs?: number;
  accuracyThresholdM?: number;
  debounceDistanceM?: number;
  snapDistanceM?: number;
};

export interface LandingHeuristicsController {
  state(): LandingState;
  beginTracking(sample: LandingSample): void;
  ingest(sample: LandingSample): LandingProposal | null;
  confirm(): LandingProposal | null;
  reject(reason?: string): void;
  cancel(reason?: string): void;
  reset(): void;
  getProposal(): LandingProposal | null;
  setCourse(context: LandingCourseContext | null): void;
}

type InternalSample = LandingSample & { speed_mps: number };

type LocalSegment = { start: LocalPoint; end: LocalPoint };

const DEFAULTS: Required<LandingHeuristicsOptions> = {
  speedThresholdMps: 0.8,
  stillDurationMs: 3000,
  accuracyThresholdM: 12,
  debounceDistanceM: 12,
  snapDistanceM: 8,
};

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function fromLocal(origin: GeoPoint, point: LocalPoint): GeoPoint {
  const lat0 = origin.lat;
  const lon0 = origin.lon;
  const latOffset = (point.y / EARTH_RADIUS_M) * (180 / Math.PI);
  const lonOffset =
    (point.x / (EARTH_RADIUS_M * Math.cos(toRadians(lat0 || 0)))) * (180 / Math.PI);
  return {
    lat: lat0 + latOffset,
    lon: lon0 + lonOffset,
  };
}

function closestPointOnSegment(point: LocalPoint, a: LocalPoint, b: LocalPoint): {
  point: LocalPoint;
  distance: number;
} {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    const dist = Math.hypot(point.x - a.x, point.y - a.y);
    return { point: { x: a.x, y: a.y }, distance: dist };
  }
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
  const clamped = Math.max(0, Math.min(1, t));
  const projX = a.x + clamped * dx;
  const projY = a.y + clamped * dy;
  const distance = Math.hypot(point.x - projX, point.y - projY);
  return { point: { x: projX, y: projY }, distance };
}

function buildSegments(bundle: CourseBundle | null, origin: GeoPoint | null): LocalSegment[] {
  if (!bundle || !origin) {
    return [];
  }
  const segments: LocalSegment[] = [];

  const pushSegment = (start: LocalPoint, end: LocalPoint) => {
    if (!Number.isFinite(start.x) || !Number.isFinite(start.y)) {
      return;
    }
    if (!Number.isFinite(end.x) || !Number.isFinite(end.y)) {
      return;
    }
    segments.push({ start, end });
  };

  const toLocalPoint = (coord: unknown): LocalPoint | null => {
    if (!Array.isArray(coord) || coord.length < 2) {
      return null;
    }
    const lon = Number(coord[0]);
    const lat = Number(coord[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }
    return toLocalENU(origin, { lat, lon });
  };

  for (const raw of bundle.features ?? []) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const feature = raw as { geometry?: { type?: unknown; coordinates?: unknown } };
    const geometry = feature.geometry;
    if (!geometry || typeof geometry.type !== 'string') {
      continue;
    }
    const type = geometry.type.toLowerCase();
    const coords = geometry.coordinates;
    if (!coords) {
      continue;
    }
    if (type === 'polygon' && Array.isArray(coords)) {
      for (const ring of coords as unknown[]) {
        if (!Array.isArray(ring) || ring.length < 2) {
          continue;
        }
        const local: LocalPoint[] = [];
        for (const coord of ring as unknown[]) {
          const point = toLocalPoint(coord);
          if (point) {
            local.push(point);
          }
        }
        if (local.length < 2) {
          continue;
        }
        for (let i = 0; i < local.length; i += 1) {
          const current = local[i];
          const next = local[(i + 1) % local.length];
          pushSegment(current, next);
        }
      }
    } else if (type === 'multipolygon' && Array.isArray(coords)) {
      for (const polygon of coords as unknown[]) {
        if (!Array.isArray(polygon)) {
          continue;
        }
        for (const ring of polygon as unknown[]) {
          if (!Array.isArray(ring) || ring.length < 2) {
            continue;
          }
          const local: LocalPoint[] = [];
          for (const coord of ring as unknown[]) {
            const point = toLocalPoint(coord);
            if (point) {
              local.push(point);
            }
          }
          if (local.length < 2) {
            continue;
          }
          for (let i = 0; i < local.length; i += 1) {
            const current = local[i];
            const next = local[(i + 1) % local.length];
            pushSegment(current, next);
          }
        }
      }
    } else if (type === 'linestring' && Array.isArray(coords)) {
      const local: LocalPoint[] = [];
      for (const coord of coords as unknown[]) {
        const point = toLocalPoint(coord);
        if (point) {
          local.push(point);
        }
      }
      for (let i = 0; i < local.length - 1; i += 1) {
        pushSegment(local[i], local[i + 1]);
      }
    } else if (type === 'multilinestring' && Array.isArray(coords)) {
      for (const line of coords as unknown[]) {
        if (!Array.isArray(line)) {
          continue;
        }
        const local: LocalPoint[] = [];
        for (const coord of line as unknown[]) {
          const point = toLocalPoint(coord);
          if (point) {
            local.push(point);
          }
        }
        for (let i = 0; i < local.length - 1; i += 1) {
          pushSegment(local[i], local[i + 1]);
        }
      }
    }
  }

  return segments;
}

function snapCandidate(
  origin: GeoPoint | null,
  segments: LocalSegment[],
  candidate: LandingCandidate,
  maxDistance: number,
): LandingCandidate {
  if (!origin || !segments.length || maxDistance <= 0) {
    return candidate;
  }
  const localCandidate = toLocalENU(origin, candidate);
  let best: { point: LocalPoint; distance: number } | null = null;
  for (const segment of segments) {
    const projected = closestPointOnSegment(localCandidate, segment.start, segment.end);
    if (!best || projected.distance < best.distance) {
      best = projected;
    }
  }
  if (!best || best.distance > maxDistance) {
    return candidate;
  }
  const snapped = fromLocal(origin, best.point);
  return { lat: snapped.lat, lon: snapped.lon };
}

function computeConfidence(
  speed: number,
  threshold: number,
  accuracy: number,
  maxAccuracy: number,
): number {
  const speedScore = Math.max(0, Math.min(1, (threshold - speed) / threshold));
  const accuracyScore = Math.max(0, Math.min(1, (maxAccuracy - accuracy) / maxAccuracy));
  const blended = 0.6 * speedScore + 0.4 * accuracyScore;
  return Math.max(0, Math.min(1, Number(blended.toFixed(2))));
}

class LandingHeuristics implements LandingHeuristicsController {
  private stateValue: LandingState = 'IDLE';

  private readonly thresholds: Required<LandingHeuristicsOptions>;

  private readonly speedFilter: SpeedAverageFilter;

  private lastSample: InternalSample | null = null;

  private trackingStart: LandingCandidate | null = null;

  private stillSince: number | null = null;

  private currentProposal: LandingProposal | null = null;

  private lastCandidate: LandingCandidate | null = null;

  private courseOrigin: GeoPoint | null = null;

  private courseSegments: LocalSegment[] = [];

  constructor(options?: LandingHeuristicsOptions) {
    this.thresholds = { ...DEFAULTS, ...(options ?? {}) };
    this.speedFilter = createSpeedAverageFilter(this.thresholds.stillDurationMs);
  }

  state(): LandingState {
    return this.stateValue;
  }

  beginTracking(sample: LandingSample): void {
    this.resetTracking();
    const normalized = this.normalizeSample(sample);
    this.lastSample = normalized;
    this.trackingStart = { lat: normalized.lat, lon: normalized.lon };
    this.stateValue = 'TRACKING';
  }

  ingest(sample: LandingSample): LandingProposal | null {
    const normalized = this.normalizeSample(sample);
    this.lastSample = normalized;
    if (this.stateValue !== 'TRACKING') {
      return null;
    }
    if (!this.trackingStart) {
      this.trackingStart = { lat: normalized.lat, lon: normalized.lon };
    }
    const smoothed = this.speedFilter.push({ timestamp: normalized.t, speed_mps: normalized.speed_mps });
    if (normalized.speed_mps < this.thresholds.speedThresholdMps) {
      if (this.stillSince === null) {
        this.stillSince = normalized.t;
      }
    } else {
      this.stillSince = null;
    }
    if (
      this.stillSince !== null &&
      normalized.t - this.stillSince >= this.thresholds.stillDurationMs &&
      normalized.acc_m <= this.thresholds.accuracyThresholdM &&
      (smoothed === null || smoothed <= this.thresholds.speedThresholdMps)
    ) {
      const candidate = this.buildCandidate(normalized);
      if (this.lastCandidate) {
        const separation = distanceMeters(this.lastCandidate, candidate);
        if (Number.isFinite(separation) && separation < this.thresholds.debounceDistanceM) {
          return null;
        }
      }
      const carry = this.computeCarry(candidate);
      const confidence = computeConfidence(
        smoothed ?? normalized.speed_mps,
        this.thresholds.speedThresholdMps,
        normalized.acc_m,
        this.thresholds.accuracyThresholdM,
      );
      const proposal: LandingProposal = {
        candidate,
        carry_m: carry,
        reason: 'speed-drop',
        conf: confidence,
      };
      this.currentProposal = proposal;
      this.lastCandidate = candidate;
      this.stateValue = 'PROPOSED';
      this.stillSince = null;
      this.speedFilter.reset();
      return proposal;
    }
    return null;
  }

  confirm(): LandingProposal | null {
    if (this.stateValue !== 'PROPOSED' || !this.currentProposal) {
      return null;
    }
    const accepted = this.currentProposal;
    this.stateValue = 'CONFIRMED';
    this.resetTracking(false);
    return accepted;
  }

  reject(_reason?: string): void {
    if (this.stateValue !== 'PROPOSED') {
      return;
    }
    this.currentProposal = null;
    this.stateValue = 'TRACKING';
    this.stillSince = null;
    this.speedFilter.reset();
  }

  cancel(_reason?: string): void {
    if (this.stateValue === 'IDLE') {
      return;
    }
    this.stateValue = 'CANCELLED';
    this.currentProposal = null;
    this.resetTracking();
  }

  reset(): void {
    this.stateValue = 'IDLE';
    this.currentProposal = null;
    this.resetTracking();
  }

  getProposal(): LandingProposal | null {
    return this.currentProposal;
  }

  setCourse(context: LandingCourseContext | null): void {
    this.courseOrigin = context?.origin ?? null;
    this.courseSegments = buildSegments(context?.bundle ?? null, this.courseOrigin);
  }

  private computeCarry(candidate: LandingCandidate): number {
    if (!this.trackingStart) {
      return 0;
    }
    const distance = distanceMeters(this.trackingStart, candidate);
    return Number.isFinite(distance) ? distance : 0;
  }

  private buildCandidate(sample: InternalSample): LandingCandidate {
    const raw = { lat: sample.lat, lon: sample.lon };
    return snapCandidate(this.courseOrigin, this.courseSegments, raw, this.thresholds.snapDistanceM);
  }

  private normalizeSample(sample: LandingSample): InternalSample {
    const speed = this.resolveSpeed(sample);
    return {
      ...sample,
      speed_mps: speed,
    };
  }

  private resolveSpeed(sample: LandingSample): number {
    if (Number.isFinite(sample.speed_mps) && sample.speed_mps >= 0) {
      return sample.speed_mps;
    }
    const currentFix: LocationFix = {
      lat: sample.lat,
      lon: sample.lon,
      acc_m: sample.acc_m,
      timestamp: sample.t,
    };
    const previousFix: LocationFix | null = this.lastSample
      ? {
          lat: this.lastSample.lat,
          lon: this.lastSample.lon,
          acc_m: this.lastSample.acc_m,
          timestamp: this.lastSample.t,
        }
      : null;
    const estimate = estimateSpeedMps(previousFix, currentFix);
    if (estimate !== null && Number.isFinite(estimate)) {
      return Math.max(0, estimate);
    }
    return 0;
  }

  private resetTracking(resetStart = true): void {
    if (resetStart) {
      this.trackingStart = null;
      this.lastCandidate = null;
    }
    this.stillSince = null;
    this.lastSample = null;
    this.speedFilter.reset();
  }
}

export function createLandingHeuristics(
  options?: LandingHeuristicsOptions,
): LandingHeuristicsController {
  return new LandingHeuristics(options);
}

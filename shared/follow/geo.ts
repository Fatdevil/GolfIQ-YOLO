import type { GeoPoint } from './types';

const EARTH_RADIUS_M = 6371000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function normalizeBearing(deg: number): number {
  if (!Number.isFinite(deg)) {
    return 0;
  }
  const normalized = deg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function haversine(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRadians(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return EARTH_RADIUS_M * c;
}

export function bearing(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLon = toRadians(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const theta = Math.atan2(y, x);
  return normalizeBearing(toDegrees(theta));
}

export function shortArcDiff(aDeg: number, bDeg: number): number {
  const delta = ((aDeg - bDeg + 540) % 360) - 180;
  return delta === -180 ? 180 : delta;
}

export function speedFromTrace(samples: readonly GeoPoint[]): number {
  if (!samples || samples.length < 2) {
    return 0;
  }
  const recent = samples[samples.length - 1]!;
  const previous = samples[samples.length - 2]!;
  const t1 = Number.isFinite(recent.ts ?? NaN) ? Number(recent.ts) : null;
  const t0 = Number.isFinite(previous.ts ?? NaN) ? Number(previous.ts) : null;
  if (t1 === null || t0 === null || t1 <= t0) {
    return 0;
  }
  const distance = haversine(previous, recent);
  const dt = (t1 - t0) / 1000;
  if (!Number.isFinite(distance) || !Number.isFinite(dt) || dt <= 0) {
    return 0;
  }
  return distance / dt;
}

export function shouldUpdate(freqHz: number, lastUpdateTs: number, now: number = Date.now()): boolean {
  if (!Number.isFinite(freqHz) || freqHz <= 0) {
    return true;
  }
  const intervalMs = 1000 / freqHz;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return true;
  }
  if (!Number.isFinite(lastUpdateTs) || lastUpdateTs <= 0) {
    return true;
  }
  return now - lastUpdateTs >= intervalMs - 1;
}

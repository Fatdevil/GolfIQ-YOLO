import type { CourseBundle } from './bundle_client';

const EARTH_RADIUS_M = 6_378_137;

export type GeoPoint = { lat: number; lon: number };
export type LocalPoint = { x: number; y: number };

export type LinePoint = { x: number; y: number };

export type PolygonLike = {
  rings: number[][][];
};

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeLocalPoint(x: number, y: number): LocalPoint {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: 0, y: 0 };
  }
  return { x, y };
}

function normalizeBearing(deg: number): number {
  const normalized = deg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

type BundleFeature = {
  id?: unknown;
  type?: unknown;
  geometry?: {
    type?: unknown;
    coordinates?: unknown;
  };
  properties?: {
    type?: unknown;
    kind?: unknown;
  };
};

type BundleLike = Pick<CourseBundle, 'features'> | { features?: unknown } | null | undefined;

function normalizeFeatureType(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

type ClosestPoint = {
  point: LocalPoint;
  distance: number;
};

function closestPointOnSegment(point: LinePoint, a: LinePoint, b: LinePoint): ClosestPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    const diffX = point.x - a.x;
    const diffY = point.y - a.y;
    const distance = Math.hypot(diffX, diffY);
    return {
      point: { x: a.x, y: a.y },
      distance,
    };
  }
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
  const clamped = Math.max(0, Math.min(1, t));
  const projX = a.x + clamped * dx;
  const projY = a.y + clamped * dy;
  const distance = Math.hypot(point.x - projX, point.y - projY);
  return {
    point: { x: projX, y: projY },
    distance,
  };
}

function closestPointOnPolyline(
  point: LinePoint,
  polyline: LinePoint[],
  closeLoop: boolean,
): ClosestPoint | null {
  if (!Array.isArray(polyline) || polyline.length === 0) {
    return null;
  }
  if (polyline.length === 1) {
    const only = polyline[0];
    return {
      point: { x: only.x, y: only.y },
      distance: Math.hypot(point.x - only.x, point.y - only.y),
    };
  }
  let best: ClosestPoint | null = null;
  const limit = closeLoop ? polyline.length : polyline.length - 1;
  for (let i = 0; i < limit; i += 1) {
    const start = polyline[i];
    const end = polyline[(i + 1) % polyline.length];
    if (!start || !end) {
      continue;
    }
    const candidate = closestPointOnSegment(point, start, end);
    if (!best || candidate.distance < best.distance) {
      best = candidate;
    }
  }
  return best;
}

export function toLocalENU(origin: GeoPoint, point: GeoPoint): LocalPoint {
  if (!origin || !point) {
    return { x: 0, y: 0 };
  }
  const lat0 = isFiniteNumber(origin.lat) ? origin.lat : 0;
  const lon0 = isFiniteNumber(origin.lon) ? origin.lon : 0;
  const lat = isFiniteNumber(point.lat) ? point.lat : lat0;
  const lon = isFiniteNumber(point.lon) ? point.lon : lon0;

  const dLat = toRadians(lat - lat0);
  const dLon = toRadians(lon - lon0);
  const meanLat = toRadians((lat + lat0) / 2);

  const x = EARTH_RADIUS_M * dLon * Math.cos(meanLat);
  const y = EARTH_RADIUS_M * dLat;

  return normalizeLocalPoint(x, y);
}

function distanceToSegment(point: LinePoint, a: LinePoint, b: LinePoint): number {
  return closestPointOnSegment(point, a, b).distance;
}

export function distancePointToLineString(point: LinePoint, line: LinePoint[]): number {
  if (!Array.isArray(line) || line.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (line.length === 1) {
    return Math.hypot(point.x - line[0].x, point.y - line[0].y);
  }
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i];
    const b = line[i + 1];
    if (!a || !b) {
      continue;
    }
    const dist = distanceToSegment(point, a, b);
    if (dist < min) {
      min = dist;
    }
  }
  return min;
}

export function bearingDeg(from: GeoPoint, to: GeoPoint): number {
  if (!from || !to) {
    return 0;
  }
  const lat1 = toRadians(isFiniteNumber(from.lat) ? from.lat : 0);
  const lat2 = toRadians(isFiniteNumber(to.lat) ? to.lat : 0);
  const dLon = toRadians((isFiniteNumber(to.lon) ? to.lon : 0) - (isFiniteNumber(from.lon) ? from.lon : 0));
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return normalizeBearing(bearing);
}

function toLocalPoint(origin: GeoPoint, coord: unknown): LocalPoint | null {
  if (!Array.isArray(coord) || coord.length < 2) {
    return null;
  }
  const lon = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return toLocalENU(origin, { lat, lon });
}

function collectLocalPolylines(
  origin: GeoPoint,
  geometry: { type?: string; coordinates?: unknown },
): LocalPoint[][] {
  if (!geometry || typeof geometry.type !== 'string') {
    return [];
  }
  const type = geometry.type.toLowerCase();
  const coords = geometry.coordinates;
  const polylines: LocalPoint[][] = [];
  if (!coords) {
    return polylines;
  }
  if (type === 'linestring' && Array.isArray(coords)) {
    const line: LocalPoint[] = [];
    for (const coord of coords as unknown[]) {
      const local = toLocalPoint(origin, coord);
      if (local) {
        line.push(local);
      }
    }
    if (line.length) {
      polylines.push(line);
    }
  } else if (type === 'multilinestring' && Array.isArray(coords)) {
    for (const line of coords as unknown[]) {
      if (!Array.isArray(line)) {
        continue;
      }
      const localLine: LocalPoint[] = [];
      for (const coord of line as unknown[]) {
        const local = toLocalPoint(origin, coord);
        if (local) {
          localLine.push(local);
        }
      }
      if (localLine.length) {
        polylines.push(localLine);
      }
    }
  }
  return polylines;
}

function collectLocalPolygonRings(
  origin: GeoPoint,
  geometry: { type?: string; coordinates?: unknown },
): LocalPoint[][] {
  if (!geometry || typeof geometry.type !== 'string') {
    return [];
  }
  const type = geometry.type.toLowerCase();
  const coords = geometry.coordinates;
  const rings: LocalPoint[][] = [];
  if (!coords) {
    return rings;
  }
  if (type === 'polygon' && Array.isArray(coords)) {
    for (const ring of coords as unknown[]) {
      if (!Array.isArray(ring)) {
        continue;
      }
      const localRing: LocalPoint[] = [];
      for (const coord of ring as unknown[]) {
        const local = toLocalPoint(origin, coord);
        if (local) {
          localRing.push(local);
        }
      }
      if (localRing.length) {
        rings.push(localRing);
      }
    }
  } else if (type === 'multipolygon' && Array.isArray(coords)) {
    for (const polygon of coords as unknown[]) {
      if (!Array.isArray(polygon)) {
        continue;
      }
      for (const ring of polygon as unknown[]) {
        if (!Array.isArray(ring)) {
          continue;
        }
        const localRing: LocalPoint[] = [];
        for (const coord of ring as unknown[]) {
          const local = toLocalPoint(origin, coord);
          if (local) {
            localRing.push(local);
          }
        }
        if (localRing.length) {
          rings.push(localRing);
        }
      }
    }
  }
  return rings;
}

function closestPointFromGeometry(
  origin: GeoPoint,
  geometry: { type?: string; coordinates?: unknown },
): ClosestPoint | null {
  if (!geometry || typeof geometry.type !== 'string') {
    return null;
  }
  const type = geometry.type.toLowerCase();
  if (type === 'point' && geometry.coordinates) {
    const local = toLocalPoint(origin, geometry.coordinates);
    if (local) {
      return { point: local, distance: Math.hypot(local.x, local.y) };
    }
    return null;
  }
  const point: LocalPoint = { x: 0, y: 0 };
  if (type === 'polygon' || type === 'multipolygon') {
    const rings = collectLocalPolygonRings(origin, geometry);
    let best: ClosestPoint | null = null;
    for (const ring of rings) {
      const candidate = closestPointOnPolyline(point, ring, true);
      if (candidate && (!best || candidate.distance < best.distance)) {
        best = candidate;
      }
    }
    return best;
  }
  if (type === 'linestring' || type === 'multilinestring') {
    const polylines = collectLocalPolylines(origin, geometry);
    let best: ClosestPoint | null = null;
    for (const line of polylines) {
      const candidate = closestPointOnPolyline(point, line, false);
      if (candidate && (!best || candidate.distance < best.distance)) {
        best = candidate;
      }
    }
    return best;
  }
  return null;
}

export function nearestFeature(
  posLatLon: GeoPoint,
  bundle: BundleLike,
  types: readonly string[] = ['hazard', 'bunker', 'water'],
): { id: string; type: string; dist_m: number; bearing: number } | null {
  if (!bundle || !Array.isArray(bundle.features)) {
    return null;
  }
  const typeSet = new Set(types.map((value) => normalizeFeatureType(value)));
  if (!isFiniteNumber(posLatLon?.lat) || !isFiniteNumber(posLatLon?.lon)) {
    return null;
  }
  const origin = {
    lat: Number(posLatLon.lat),
    lon: Number(posLatLon.lon),
  };
  let best: { id: string; type: string; dist_m: number; bearing: number } | null = null;
  for (const raw of bundle.features as BundleFeature[]) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const featureType =
      normalizeFeatureType(raw.type) ||
      normalizeFeatureType(raw.properties?.type) ||
      normalizeFeatureType(raw.properties?.kind);
    if (!typeSet.has(featureType)) {
      continue;
    }
    const geometry = raw.geometry;
    if (!geometry || typeof geometry !== 'object') {
      continue;
    }
    const candidate = closestPointFromGeometry(origin, geometry as { type?: string; coordinates?: unknown });
    if (!candidate) {
      continue;
    }
    const id = typeof raw.id === 'string' && raw.id ? raw.id : 'feature';
    const distance = candidate.distance;
    const bearing = normalizeBearing((Math.atan2(candidate.point.x, candidate.point.y) * 180) / Math.PI);
    if (!best || distance < best.dist_m) {
      best = {
        id,
        type: featureType || 'feature',
        dist_m: distance,
        bearing,
      };
    }
  }
  return best;
}

export function distancePointToPolygonEdge(point: LinePoint, polygon: PolygonLike): number {
  if (!polygon || !Array.isArray(polygon.rings) || polygon.rings.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  let min = Number.POSITIVE_INFINITY;
  for (const ring of polygon.rings) {
    if (!Array.isArray(ring) || ring.length < 2) {
      continue;
    }
    const ringLength = ring.length;
    for (let i = 0; i < ringLength; i += 1) {
      const current = ring[i];
      const next = ring[(i + 1) % ringLength];
      if (!Array.isArray(current) || !Array.isArray(next) || current.length < 2 || next.length < 2) {
        continue;
      }
      const a: LinePoint = { x: Number(current[0]) || 0, y: Number(current[1]) || 0 };
      const b: LinePoint = { x: Number(next[0]) || 0, y: Number(next[1]) || 0 };
      const dist = distanceToSegment(point, a, b);
      if (dist < min) {
        min = dist;
      }
    }
  }
  return min;
}


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
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    const diffX = point.x - a.x;
    const diffY = point.y - a.y;
    return Math.hypot(diffX, diffY);
  }
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
  const clamped = Math.max(0, Math.min(1, t));
  const projX = a.x + clamped * dx;
  const projY = a.y + clamped * dy;
  return Math.hypot(point.x - projX, point.y - projY);
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


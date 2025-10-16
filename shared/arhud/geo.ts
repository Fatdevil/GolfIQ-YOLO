export type LatLon = {
  lat: number;
  lon: number;
};

export type Vec2 = {
  x: number;
  y: number;
};

export type LineString = readonly Vec2[];
export type Polygon = readonly LineString[];

const EARTH_RADIUS_M = 6378137;
const DEG_TO_RAD = Math.PI / 180;

export function toLocalENU(origin: LatLon, target: LatLon): Vec2 {
  const cosLat = Math.cos(origin.lat * DEG_TO_RAD);
  const deltaLat = (target.lat - origin.lat) * DEG_TO_RAD;
  const deltaLon = (target.lon - origin.lon) * DEG_TO_RAD;
  const x = EARTH_RADIUS_M * deltaLon * cosLat;
  const y = EARTH_RADIUS_M * deltaLat;
  return { x, y };
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function distancePointToSegment(point: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const denom = abx * abx + aby * aby;
  if (denom === 0) {
    const dx = point.x - a.x;
    const dy = point.y - a.y;
    return Math.hypot(dx, dy);
  }
  const t = clamp01((apx * abx + apy * aby) / denom);
  const closestX = a.x + abx * t;
  const closestY = a.y + aby * t;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

export function distancePointToLineString(point: Vec2, line: LineString): number {
  if (!line.length) {
    return Number.POSITIVE_INFINITY;
  }
  if (line.length === 1) {
    const dx = point.x - line[0].x;
    const dy = point.y - line[0].y;
    return Math.hypot(dx, dy);
  }
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < line.length; i += 1) {
    const dist = distancePointToSegment(point, line[i - 1], line[i]);
    if (dist < min) {
      min = dist;
    }
  }
  return min;
}

export function distancePointToPolygonEdge(point: Vec2, polygon: Polygon): number {
  if (!polygon.length) {
    return Number.POSITIVE_INFINITY;
  }
  let min = Number.POSITIVE_INFINITY;
  for (const ring of polygon) {
    if (!ring.length) {
      continue;
    }
    const loop = ring[0].x === ring[ring.length - 1]?.x && ring[0].y === ring[ring.length - 1]?.y
      ? ring
      : [...ring, ring[0]];
    for (let i = 1; i < loop.length; i += 1) {
      const dist = distancePointToSegment(point, loop[i - 1], loop[i]);
      if (dist < min) {
        min = dist;
      }
    }
  }
  return min;
}

export type XY = { x: number; y: number };
export type LL = { lat: number; lon: number };

const EARTH_RADIUS_M = 6_371_000;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// Fit a world bbox into a canvas size (px) and return transforms
export function fitTransform(
  worldMin: XY,
  worldMax: XY,
  canvasW: number,
  canvasH: number,
  paddingPx = 8
): { toScreen(p: XY): XY; toWorld(p: XY): XY; scale: number } {
  const innerW = Math.max(canvasW - paddingPx * 2, 0);
  const innerH = Math.max(canvasH - paddingPx * 2, 0);

  const worldWidth = worldMax.x - worldMin.x;
  const worldHeight = worldMax.y - worldMin.y;

  const scaleX = worldWidth === 0 ? Number.POSITIVE_INFINITY : innerW / worldWidth;
  const scaleY = worldHeight === 0 ? Number.POSITIVE_INFINITY : innerH / worldHeight;

  let scale = Math.min(scaleX, scaleY);
  if (!isFinite(scale) || scale <= 0) {
    scale = 1;
  }

  const scaledWidth = worldWidth * scale;
  const scaledHeight = worldHeight * scale;

  const offsetX = (canvasW - scaledWidth) / 2 - worldMin.x * scale;
  const offsetY = (canvasH - scaledHeight) / 2 - worldMin.y * scale;

  const toScreen = (p: XY): XY => ({
    x: p.x * scale + offsetX,
    y: p.y * scale + offsetY,
  });

  const toWorld = (p: XY): XY => ({
    x: scale === 0 ? worldMin.x : (p.x - offsetX) / scale,
    y: scale === 0 ? worldMin.y : (p.y - offsetY) / scale,
  });

  return { toScreen, toWorld, scale };
}

const degToRad = (deg: number) => (deg * Math.PI) / 180;

// Cheap geodesic ~ meters for small deltas (haversine-lite)
export function metersBetween(a: LL, b: LL): number {
  const lat1 = degToRad(a.lat);
  const lat2 = degToRad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = degToRad(b.lon - a.lon);
  const meanLat = (lat1 + lat2) / 2;

  const x = dLon * Math.cos(meanLat);
  const y = dLat;

  return Math.sqrt(x * x + y * y) * EARTH_RADIUS_M;
}

// Build a stroked “corridor polygon” centered on a polyline heading with given half-width
export function corridorPolygon(start: XY, end: XY, halfWidthPx: number): XY[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return [
      { x: start.x - halfWidthPx, y: start.y - halfWidthPx },
      { x: start.x + halfWidthPx, y: start.y - halfWidthPx },
      { x: start.x + halfWidthPx, y: start.y + halfWidthPx },
      { x: start.x - halfWidthPx, y: start.y + halfWidthPx },
    ];
  }

  const invLength = 1 / length;
  const nx = -dy * invLength;
  const ny = dx * invLength;

  const startLeft = { x: start.x + nx * halfWidthPx, y: start.y + ny * halfWidthPx };
  const startRight = { x: start.x - nx * halfWidthPx, y: start.y - ny * halfWidthPx };
  const endLeft = { x: end.x + nx * halfWidthPx, y: end.y + ny * halfWidthPx };
  const endRight = { x: end.x - nx * halfWidthPx, y: end.y - ny * halfWidthPx };

  return [startLeft, startRight, endRight, endLeft];
}

// Build a circle (n-gon) for landing ring
export function ringPolygon(center: XY, radiusPx: number, segments = 48): XY[] {
  const safeSegments = Math.max(3, Math.floor(segments));
  const clampedRadius = clamp(Math.abs(radiusPx), 0, Number.MAX_SAFE_INTEGER);
  const points: XY[] = [];

  for (let i = 0; i < safeSegments; i += 1) {
    const theta = (2 * Math.PI * i) / safeSegments;
    points.push({
      x: center.x + clampedRadius * Math.cos(theta),
      y: center.y + clampedRadius * Math.sin(theta),
    });
  }

  return points;
}

import type { BagStats, ClubId } from '../bag/types';
import { computeOverlay, type OverlayOut } from './aim';
import { fitTransform, type XY } from './geom';

type VectorRing = XY[];

type VectorPolygon = VectorRing[];

export type VectorHoleModel = {
  id: string;
  fairways?: VectorPolygon[];
  greens?: VectorPolygon[];
  bunkers?: VectorPolygon[];
  waters?: VectorPolygon[];
};

type VectorOverlayInput = {
  hole: VectorHoleModel | null;
  tee: XY | null;
  target: XY | null;
  bag: BagStats;
  club?: ClubId;
  size: { w: number; h: number };
};

export type ProjectedPolygons = {
  fairways: string[];
  greens: string[];
  bunkers: string[];
  waters: string[];
};

export type VectorOverlayGeometry = {
  overlay: OverlayOut;
  polygons: ProjectedPolygons;
  ringPath: string;
  corridorPath: string;
  ringCenter: XY;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const pathFromScreenPoints = (points: XY[]): string => {
  if (!Array.isArray(points) || points.length === 0) {
    return '';
  }
  const [first, ...rest] = points;
  let d = `M${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  rest.forEach((point) => {
    d += ` L${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  });
  if (points.length > 1) {
    d += ' Z';
  }
  return d;
};

const projectRing = (ring: VectorRing, project: (point: XY) => XY): string => {
  if (!Array.isArray(ring) || ring.length < 3) {
    return '';
  }
  const projected = ring.map(project);
  return pathFromScreenPoints(projected);
};

const projectPolygon = (polygon: VectorPolygon, project: (point: XY) => XY): string => {
  if (!Array.isArray(polygon) || polygon.length === 0) {
    return '';
  }
  let path = '';
  polygon.forEach((ring) => {
    const ringPath = projectRing(ring, project);
    if (ringPath) {
      path += `${ringPath} `;
    }
  });
  return path.trim();
};

const projectPolygonSet = (
  polygons: VectorPolygon[] | undefined,
  project: (point: XY) => XY,
): string[] => {
  if (!Array.isArray(polygons)) {
    return [];
  }
  return polygons
    .map((polygon) => projectPolygon(polygon, project))
    .filter((path) => path.length > 0);
};

export function computeVectorOverlayGeometry(input: VectorOverlayInput): VectorOverlayGeometry | null {
  const { hole, tee, target, bag, club, size } = input;
  if (!hole || !tee || !target) {
    return null;
  }
  if (!isFiniteNumber(size.w) || !isFiniteNumber(size.h) || size.w <= 0 || size.h <= 0) {
    return null;
  }

  const overlay = computeOverlay({ tee, target, canvas: size, bag, club });

  const landingRadius = clamp(overlay.meta.p50_m * 0.08, 6, 40);
  let dispersionSource: number | undefined;
  if (isFiniteNumber(overlay.meta.std_m)) {
    dispersionSource = overlay.meta.std_m * 2;
  } else if (isFiniteNumber(overlay.meta.p75_m) && isFiniteNumber(overlay.meta.p25_m)) {
    dispersionSource = (overlay.meta.p75_m - overlay.meta.p25_m) / 1.15;
  }
  const corridorHalfWidth = clamp(dispersionSource ?? 6, 6, 35);
  const maxRadius = Math.max(landingRadius, corridorHalfWidth);

  const worldMin: XY = {
    x: Math.min(tee.x, target.x) - maxRadius,
    y: Math.min(tee.y, target.y) - maxRadius,
  };
  const worldMax: XY = {
    x: Math.max(tee.x, target.x) + maxRadius,
    y: Math.max(tee.y, target.y) + maxRadius,
  };

  const transform = fitTransform(worldMin, worldMax, size.w, size.h);
  const project = (point: XY): XY => transform.toScreen(point);

  const polygons: ProjectedPolygons = {
    fairways: projectPolygonSet(hole.fairways, project),
    greens: projectPolygonSet(hole.greens, project),
    bunkers: projectPolygonSet(hole.bunkers, project),
    waters: projectPolygonSet(hole.waters, project),
  };

  const ringPath = pathFromScreenPoints(overlay.ring);
  const corridorPath = pathFromScreenPoints(overlay.corridor);

  return {
    overlay,
    polygons,
    ringPath,
    corridorPath,
    ringCenter: project(target),
  };
}

import { toLocalENU, type GeoPoint } from './geo';

export type GhostTrajectoryParams = {
  startLatLon: GeoPoint;
  targetLatLon: GeoPoint;
  playsLike_m: number;
  launchDeg?: number;
  wind_mps?: number;
  cross_from_deg?: number;
  g?: number;
};

export type GhostTrajectoryPoint = { x: number; y: number };

export type GhostTrajectoryResult = {
  path: GhostTrajectoryPoint[];
  apexIdx: number;
  lateral_m: number;
  impactEllipse: { major_m: number; minor_m: number };
};

const SAMPLE_COUNT = 40;
const DEFAULT_IRON_LAUNCH_DEG = 14;
const DEFAULT_WOOD_LAUNCH_DEG = 11;
const WOOD_THRESHOLD_METERS = 190;
const CROSSWIND_GAIN = 0.12;
const MIN_RANGE = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function resolveLaunchAngle(playsLike_m: number, launchDeg?: number): number {
  if (Number.isFinite(launchDeg) && (launchDeg ?? 0) > 0) {
    return launchDeg as number;
  }
  if (!Number.isFinite(playsLike_m)) {
    return DEFAULT_IRON_LAUNCH_DEG;
  }
  return playsLike_m >= WOOD_THRESHOLD_METERS ? DEFAULT_WOOD_LAUNCH_DEG : DEFAULT_IRON_LAUNCH_DEG;
}

function resolveRange(playsLike_m: number, fallback: number): number {
  if (Number.isFinite(playsLike_m) && playsLike_m > MIN_RANGE) {
    return playsLike_m;
  }
  return Math.max(fallback, MIN_RANGE);
}

function computeHeadingRad(start: GeoPoint, target: GeoPoint): number {
  const local = toLocalENU(start, target);
  if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) {
    return 0;
  }
  return Math.atan2(local.x, local.y);
}

export function computeGhostTrajectory(params: GhostTrajectoryParams): GhostTrajectoryResult | null {
  const { startLatLon, targetLatLon } = params;
  if (!startLatLon || !targetLatLon) {
    return null;
  }
  const g = Number.isFinite(params.g) && (params.g ?? 0) > 0 ? (params.g as number) : 9.81;
  const launchDeg = resolveLaunchAngle(params.playsLike_m, params.launchDeg);
  const launchRad = toRadians(clamp(launchDeg, 4, 45));
  const headingRad = computeHeadingRad(startLatLon, targetLatLon);
  const localTarget = toLocalENU(startLatLon, targetLatLon);
  const fallbackRange = Math.hypot(localTarget.x, localTarget.y);
  const range = resolveRange(params.playsLike_m, fallbackRange);
  const sinTwoTheta = Math.sin(2 * launchRad) || 1e-4;
  const v = Math.sqrt((range * g) / sinTwoTheta);
  const vx = v * Math.cos(launchRad);
  const vy = v * Math.sin(launchRad);
  const totalTime = vx > 0 ? range / vx : (2 * vy) / g;
  const apexTime = vy / g;
  const apexUnscaled = vy * apexTime - 0.5 * g * apexTime * apexTime;
  const apexLimit = range * 0.35;
  const heightScale = apexUnscaled > 0 ? clamp(apexLimit / apexUnscaled, 0.35, 1) : 1;
  const path: GhostTrajectoryPoint[] = [];
  const steps = Math.max(SAMPLE_COUNT, 2);
  for (let i = 0; i < steps; i += 1) {
    const t = (totalTime * i) / (steps - 1);
    const x = clamp(vx * t, 0, range);
    const yRaw = vy * t - 0.5 * g * t * t;
    const y = Math.max(0, yRaw * heightScale);
    path.push({ x, y });
  }
  let apexIdx = 0;
  let maxY = -Infinity;
  for (let i = 0; i < path.length; i += 1) {
    if (path[i].y > maxY) {
      maxY = path[i].y;
      apexIdx = i;
    }
  }
  const windSpeed = Number.isFinite(params.wind_mps) ? (params.wind_mps as number) : 0;
  let lateral_m = 0;
  if (windSpeed !== 0) {
    const windFromDeg = Number.isFinite(params.cross_from_deg) ? (params.cross_from_deg as number) : 0;
    const windToRad = toRadians((windFromDeg + 180) % 360);
    const relative = windToRad - headingRad;
    const cross = windSpeed * Math.sin(relative);
    lateral_m = cross * totalTime * CROSSWIND_GAIN;
  }
  const impactEllipse = (() => {
    const major = clamp(range * 0.04, 2, 9);
    const minor = clamp(major * 0.45, 0.8, major);
    return { major_m: major, minor_m: minor };
  })();

  return {
    path,
    apexIdx,
    lateral_m,
    impactEllipse,
  };
}

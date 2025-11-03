import { toLocalENU, type GeoPoint } from "../arhud/geo";
import type {
  CourseBundle,
  CourseFeature,
  FatSide,
  GreenInfo,
  GreenSection,
} from "../arhud/bundle_client";
import { CLUB_SEQUENCE, type ClubId } from "../playslike/bag";
import { applyGameRiskBias, applyGameRiskProfile } from "../game/context";
import { getCaddieRc } from "./rc";
import { runMonteCarloV1_5, type McPolygon, type McResult, type McTarget } from "./mc";
import { ellipseOverlapRisk, lateralWindOffset, sampleEllipsePoints, type RiskFeature } from "./risk";
import { buildPlayerModel, type PlayerModel } from "./player_model";
import { STRATEGY_DEFAULTS, type RiskProfile, type StrategyWeights } from "./strategy_profiles";

const EARTH_RADIUS_M = 6_378_137;

export type RiskMode = "safe" | "normal" | "aggressive";

export interface ShotPlan {
  kind: "tee" | "approach";
  club: ClubId;
  target: GeoPoint;
  aimDeg: number;
  aimDirection: "LEFT" | "RIGHT" | "STRAIGHT";
  reason: string;
  risk: number;
  ev?: number;
  landing: { distance_m: number; lateral_m: number };
  aim: { lateral_m: number };
  mode: RiskMode;
  carry_m: number;
  crosswind_mps: number;
  headwind_mps: number;
  windDrift_m: number;
  tuningActive: boolean;
  mc?: McResult | null;
  riskFactors?: string[];
  greenSection?: GreenSection | null;
  fatSide?: FatSide | null;
}

type WindInput = { speed_mps?: number; from_deg?: number } | null | undefined;

type TeePlanArgs = {
  bundle: CourseBundle | null;
  tee: GeoPoint;
  pin: GeoPoint;
  player: PlayerModel;
  riskMode: RiskMode;
  wind?: WindInput;
  slope_dh_m?: number;
  goForGreen?: boolean;
  par?: number;
  useMC?: boolean;
  mcSamples?: number;
  mcSeed?: number;
};

type ApproachPlanArgs = {
  bundle: CourseBundle | null;
  ball: GeoPoint;
  pin: GeoPoint;
  player: PlayerModel;
  riskMode: RiskMode;
  wind?: WindInput;
  slope_dh_m?: number;
  preferredClub?: ClubId;
  useMC?: boolean;
  mcSamples?: number;
  mcSeed?: number;
};

const RISK_MULTIPLIER: Record<RiskMode, number> = {
  safe: 1.2,
  normal: 1,
  aggressive: 0.8,
};

const AIM_OFFSETS_TEE = [-25, -15, -8, 0, 8, 15, 25];
const AIM_OFFSETS_APPROACH = [-12, -8, -4, 0, 4, 8, 12];
const STEP_METERS = 10;
const MIN_DISTANCE = 30;

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

const wrapDegrees = (deg: number): number => {
  const normalized = deg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const fromLocal = (origin: GeoPoint, point: { x: number; y: number }): GeoPoint => {
  const lat0 = origin.lat;
  const lon0 = origin.lon;
  const latOffset = (point.y / EARTH_RADIUS_M) * (180 / Math.PI);
  const lonOffset =
    (point.x / (EARTH_RADIUS_M * Math.cos(toRadians(lat0 || 0)))) * (180 / Math.PI);
  return {
    lat: lat0 + latOffset,
    lon: lon0 + lonOffset,
  };
};

type Frame = {
  origin: GeoPoint;
  cos: number;
  sin: number;
  headingDeg: number;
  pin: { x: number; y: number };
};

const buildFrame = (origin: GeoPoint, pin: GeoPoint): Frame | null => {
  if (!origin || !pin) {
    return null;
  }
  const baseline = toLocalENU(origin, pin);
  const length = Math.hypot(baseline.x, baseline.y);
  if (!Number.isFinite(length) || length <= 0) {
    return null;
  }
  const headingRad = Math.atan2(baseline.x, baseline.y);
  const cos = Math.cos(headingRad);
  const sin = Math.sin(headingRad);
  const pinAligned = {
    x: baseline.x * cos - baseline.y * sin,
    y: baseline.x * sin + baseline.y * cos,
  };
  const headingDeg = wrapDegrees((headingRad * 180) / Math.PI);
  return {
    origin,
    cos,
    sin,
    headingDeg,
    pin: pinAligned,
  };
};

const toFramePoint = (
  frame: Frame,
  coord: unknown,
): { x: number; y: number } | null => {
  if (!Array.isArray(coord) || coord.length < 2) {
    return null;
  }
  const lon = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  const local = toLocalENU(frame.origin, { lat, lon });
  return {
    x: local.x * frame.cos - local.y * frame.sin,
    y: local.x * frame.sin + local.y * frame.cos,
  };
};

const collectPolygonRings = (frame: Frame, geometry: { type?: string; coordinates?: unknown }): { x: number; y: number }[][] => {
  const rings: { x: number; y: number }[][] = [];
  if (!geometry || typeof geometry.type !== "string") {
    return rings;
  }
  const type = geometry.type.toLowerCase();
  const coords = geometry.coordinates;
  if (!coords) {
    return rings;
  }
  const pushRing = (ringCoords: unknown) => {
    if (!Array.isArray(ringCoords)) {
      return;
    }
    const ring: { x: number; y: number }[] = [];
    for (const coord of ringCoords as unknown[]) {
      const point = toFramePoint(frame, coord);
      if (point) {
        ring.push(point);
      }
    }
    if (ring.length) {
      rings.push(ring);
    }
  };
  if (type === "polygon" && Array.isArray(coords)) {
    for (const ring of coords as unknown[]) {
      pushRing(ring);
    }
  } else if (type === "multipolygon" && Array.isArray(coords)) {
    for (const polygon of coords as unknown[]) {
      if (!Array.isArray(polygon)) {
        continue;
      }
      for (const ring of polygon as unknown[]) {
        pushRing(ring);
      }
    }
  }
  return rings;
};

const collectPolylines = (frame: Frame, geometry: { type?: string; coordinates?: unknown }): { x: number; y: number }[][] => {
  const lines: { x: number; y: number }[][] = [];
  if (!geometry || typeof geometry.type !== "string") {
    return lines;
  }
  const type = geometry.type.toLowerCase();
  const coords = geometry.coordinates;
  if (!coords) {
    return lines;
  }
  const pushLine = (lineCoords: unknown) => {
    if (!Array.isArray(lineCoords)) {
      return;
    }
    const line: { x: number; y: number }[] = [];
    for (const coord of lineCoords as unknown[]) {
      const point = toFramePoint(frame, coord);
      if (point) {
        line.push(point);
      }
    }
    if (line.length) {
      lines.push(line);
    }
  };
  if (type === "linestring" && Array.isArray(coords)) {
    pushLine(coords);
  } else if (type === "multilinestring" && Array.isArray(coords)) {
    for (const line of coords as unknown[]) {
      pushLine(line);
    }
  }
  return lines;
};

const computeRingCentroid = (ring: { x: number; y: number }[]): { x: number; y: number } | null => {
  if (!Array.isArray(ring) || ring.length === 0) {
    return null;
  }
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const point of ring) {
    if (!point) {
      continue;
    }
    const { x, y } = point;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    sumX += x;
    sumY += y;
    count += 1;
  }
  if (!count) {
    return null;
  }
  return { x: sumX / count, y: sumY / count };
};

const computeGreenCentroid = (rings: { x: number; y: number }[][]): { x: number; y: number } | null => {
  if (!Array.isArray(rings) || rings.length === 0) {
    return null;
  }
  for (const ring of rings) {
    const centroid = computeRingCentroid(ring);
    if (centroid) {
      return centroid;
    }
  }
  return null;
};

const computeGreenYRange = (
  rings: { x: number; y: number }[][],
): { min: number; max: number } | null => {
  if (!Array.isArray(rings) || rings.length === 0) {
    return null;
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const ring of rings) {
    if (!Array.isArray(ring)) {
      continue;
    }
    for (const point of ring) {
      if (!point) {
        continue;
      }
      const { y } = point;
      if (!Number.isFinite(y)) {
        continue;
      }
      if (y < min) {
        min = y;
      }
      if (y > max) {
        max = y;
      }
    }
  }
  if (min === Number.POSITIVE_INFINITY || max === Number.NEGATIVE_INFINITY) {
    return null;
  }
  return { min, max };
};

type DomType =
  | "fairway"
  | "green"
  | "hazard"
  | "water"
  | "bunker"
  | "cartpath"
  | "green_target"
  | null;

const normalizeFeatureType = (raw: any): DomType => {
  const p = (
    raw?.properties?.type ?? raw?.properties?.kind ?? raw?.properties?.category ?? ""
  )
    .toString()
    .toLowerCase();
  const map: Record<string, DomType> = {
    fairway: "fairway",
    green: "green",
    putting_green: "green",
    green_complex: "green",
    bunker: "bunker",
    sand: "bunker",
    sand_trap: "bunker",
    water: "water",
    pond: "water",
    lake: "water",
    hazard: "hazard",
    penalty: "hazard",
    penalty_area: "hazard",
    green_target: "green_target",
    green_section: "green_target",
    target: "green_target",
    cartpath: "cartpath",
    cart_path: "cartpath",
    path: "cartpath",
  };
  if (p && map[p]) {
    return map[p];
  }
  const fallback = (raw?.type ?? "").toString().toLowerCase();
  if (fallback && fallback !== "feature") {
    return map[fallback] ?? null;
  }
  return null;
};

const hazardPenalty = (type: DomType): number => {
  if (type === "water" || type === "hazard") {
    return 1;
  }
  if (type === "bunker") {
    return 0.6;
  }
  return 0.4;
};

type PreparedTarget = {
  id: string | null;
  rings: { x: number; y: number }[][];
  section: GreenSection | null;
  priority: number | null;
};

type PreparedFeatures = {
  hazards: RiskFeature[];
  fairways: { x: number; y: number }[][];
  greens: PreparedGreen[];
  greenRings: { x: number; y: number }[][];
  cartpaths: { x: number; y: number }[][];
  greenTargets: PreparedTarget[];
};

const DEFAULT_GREEN_SECTIONS: readonly GreenSection[] = [
  "front",
  "middle",
  "back",
];

type PreparedGreen = {
  id: string | null;
  rings: { x: number; y: number }[][];
  meta: GreenInfo | null;
  centroid: { x: number; y: number } | null;
  yRange: { min: number; max: number } | null;
};

type TeeCandidate = {
  club: ClubId;
  carry: number;
  distance: number;
  aimOffset: number;
  aimDeg: number;
  aimDegSigned: number;
  aimDir: "LEFT" | "RIGHT" | "STRAIGHT";
  risk: number;
  combined: number;
  remaining: number;
  centerX: number;
  sigmaLong: number;
  sigmaLat: number;
  mc?: McResult | null;
  ev?: number;
};

type ApproachCandidate = {
  aimOffset: number;
  aimDeg: number;
  aimDegSigned: number;
  aimDir: "LEFT" | "RIGHT" | "STRAIGHT";
  risk: number;
  combined: number;
  centerX: number;
  sigmaLong: number;
  sigmaLat: number;
  mc?: McResult | null;
  ev?: number;
};

type CandidateWithMc = {
  aimOffset: number;
  aimDir: "LEFT" | "RIGHT" | "STRAIGHT";
  mc?: McResult | null;
  ev?: number;
};

const normalizeSamples = (samples?: number): number => {
  const value = Number(samples);
  if (!Number.isFinite(value)) {
    return 800;
  }
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) {
    return 800;
  }
  return Math.max(32, Math.min(5000, rounded));
};

const DEFAULT_RISK_GATE = 0.42;

const readRiskGate = (): number => {
  try {
    const rc = getCaddieRc();
    const raw = rc?.riskMax;
    if (Number.isFinite(raw ?? NaN)) {
      return clamp01(Number(raw));
    }
  } catch (error) {
    // ignore and fallback
  }
  return DEFAULT_RISK_GATE;
};

const toMcHazards = (features: RiskFeature[]): McPolygon[] => {
  const hazards: McPolygon[] = [];
  for (const feature of features) {
    if (!feature || feature.kind !== "polygon") {
      continue;
    }
    if (!feature.rings || !feature.rings.length) {
      continue;
    }
    hazards.push({
      id: feature.id ?? null,
      rings: feature.rings,
      penalty: feature.penalty,
    });
  }
  return hazards;
};

const toMcTargets = (
  targets: PreparedTarget[],
  fallback: { x: number; y: number }[][],
): McTarget[] => {
  const out: McTarget[] = [];
  for (const target of targets) {
    if (!target || !target.rings || !target.rings.length) {
      continue;
    }
    out.push({
      id: target.id,
      rings: target.rings,
      section: target.section ?? undefined,
      priority: target.priority ?? undefined,
    });
  }
  if (!out.length && fallback.length) {
    out.push({ id: "green", rings: fallback, section: undefined, priority: undefined });
  }
  return out;
};

const formatMcReasons = (mc: McResult | null | undefined, limit = 2): string[] => {
  if (!mc || !Array.isArray(mc.reasons) || !mc.reasons.length) {
    return [];
  }
  const reasons: string[] = [];
  for (const reason of mc.reasons) {
    if (!reason || typeof reason.label !== "string") {
      continue;
    }
    const label = reason.label.trim();
    if (!label || reasons.includes(label)) {
      continue;
    }
    reasons.push(label);
    if (reasons.length >= limit) {
      break;
    }
  }
  return reasons;
};

const OPPOSITE_AIM_THRESHOLD = 0.5;

const hazardDirection = (mc: McResult | null | undefined): "left" | "right" | null => {
  if (!mc || !Array.isArray(mc.reasons)) {
    return null;
  }
  for (const reason of mc.reasons) {
    if (!reason || reason.kind !== "hazard") {
      continue;
    }
    const directionRaw = reason.meta?.direction;
    if (directionRaw === "left" || directionRaw === "right") {
      return directionRaw;
    }
  }
  return null;
};

const aimOpposesHazard = (offset: number, direction: "left" | "right"): boolean => {
  if (!Number.isFinite(offset)) {
    return false;
  }
  if (direction === "right") {
    return offset <= -OPPOSITE_AIM_THRESHOLD;
  }
  return offset >= OPPOSITE_AIM_THRESHOLD;
};

const evToleranceByMode: Record<RiskMode, number> = {
  safe: 0.65,
  normal: 0.32,
  aggressive: 0.36,
};

const adjustCandidateForHazard = <T extends CandidateWithMc>(
  pool: T[],
  best: T,
  riskGate: number,
  riskMode: RiskMode,
): T => {
  if (!pool.length) {
    return best;
  }
  const bestMc = best.mc;
  if (!bestMc) {
    return best;
  }
  let direction = hazardDirection(bestMc);
  if (!direction) {
    let safest: { hazard: number; offset: number } | null = null;
    for (const candidate of pool) {
      if (!candidate?.mc) {
        continue;
      }
      const hazard = Number(candidate.mc.hazardRate ?? NaN);
      if (!Number.isFinite(hazard)) {
        continue;
      }
      if (!safest || hazard < safest.hazard) {
        safest = { hazard, offset: candidate.aimOffset };
      }
    }
    if (safest) {
      if (safest.offset <= -OPPOSITE_AIM_THRESHOLD) {
        direction = "right";
      } else if (safest.offset >= OPPOSITE_AIM_THRESHOLD) {
        direction = "left";
      }
    }
  }
  if (!direction) {
    return best;
  }
  if (aimOpposesHazard(best.aimOffset, direction)) {
    return best;
  }
  const bestHazard = Number(bestMc.hazardRate ?? NaN);
  if (!Number.isFinite(bestHazard)) {
    return best;
  }
  const hazardRates = pool
    .map((candidate) => Number(candidate.mc?.hazardRate ?? NaN))
    .filter((value) => Number.isFinite(value));
  if (!hazardRates.length) {
    return best;
  }
  const minHazard = Math.min(...hazardRates);
  const hazardImprovementThreshold = Math.max(0.0005, riskGate * 0.005);
  if (bestHazard <= minHazard + hazardImprovementThreshold) {
    return best;
  }
  const evBest = Number(best.ev ?? Number.NEGATIVE_INFINITY);
  if (!Number.isFinite(evBest)) {
    return best;
  }
  const evTolerance = evToleranceByMode[riskMode] ?? 0.25;
  const options = pool
    .filter((candidate) => {
      if (!candidate || candidate === best) {
        return false;
      }
      if (!candidate.mc) {
        return false;
      }
      const candidateHazard = Number(candidate.mc.hazardRate ?? NaN);
      if (!Number.isFinite(candidateHazard) || candidateHazard > riskGate + 1e-6) {
        return false;
      }
      if (!aimOpposesHazard(candidate.aimOffset, direction)) {
        return false;
      }
      if (bestHazard - candidateHazard <= hazardImprovementThreshold) {
        return false;
      }
      const candidateEv = Number(candidate.ev ?? Number.NEGATIVE_INFINITY);
      if (!Number.isFinite(candidateEv)) {
        return false;
      }
      return candidateEv >= evBest - evTolerance;
    })
    .sort((a, b) => {
      const hazardA = Number(a.mc?.hazardRate ?? NaN);
      const hazardB = Number(b.mc?.hazardRate ?? NaN);
      if (Number.isFinite(hazardA) && Number.isFinite(hazardB) && Math.abs(hazardA - hazardB) > 1e-3) {
        return hazardA - hazardB;
      }
      if (riskMode === "safe") {
        const magnitudeDelta = Math.abs(b.aimOffset) - Math.abs(a.aimOffset);
        if (Math.abs(magnitudeDelta) > 1e-3) {
          return magnitudeDelta;
        }
      } else if (riskMode === "aggressive") {
        const magnitudeDelta = Math.abs(a.aimOffset) - Math.abs(b.aimOffset);
        if (Math.abs(magnitudeDelta) > 1e-3) {
          return magnitudeDelta;
        }
      }
      const evA = Number(a.ev ?? Number.NEGATIVE_INFINITY);
      const evB = Number(b.ev ?? Number.NEGATIVE_INFINITY);
      if (Number.isFinite(evA) && Number.isFinite(evB) && evA !== evB) {
        return evB - evA;
      }
      return Math.abs(a.aimOffset) - Math.abs(b.aimOffset);
    });
  return options[0] ?? best;
};

const normalizeGreenMeta = (meta: GreenInfo | null | undefined): GreenInfo | null => {
  if (!meta) {
    return null;
  }
  const sectionsSource = Array.isArray(meta.sections) ? meta.sections : [];
  const sections: GreenSection[] = [];
  for (const section of sectionsSource) {
    if (!section) {
      continue;
    }
    if (!sections.includes(section)) {
      sections.push(section);
    }
  }
  if (!sections.length) {
    sections.push(...DEFAULT_GREEN_SECTIONS);
  }
  const fatSide: FatSide | null = meta.fatSide === "L" || meta.fatSide === "R" ? meta.fatSide : null;
  const pin =
    meta.pin &&
    typeof meta.pin.lat === "number" &&
    typeof meta.pin.lon === "number" &&
    Number.isFinite(meta.pin.lat) &&
    Number.isFinite(meta.pin.lon)
      ? { lat: meta.pin.lat, lon: meta.pin.lon, ts: meta.pin.ts ?? null }
      : null;
  const targets: {
    id: string | null;
    section: GreenSection | null;
    priority: number | null;
    rings: [number, number][][];
  }[] = [];
  if (Array.isArray(meta.targets)) {
    for (const target of meta.targets) {
      if (!target || !Array.isArray(target.rings)) {
        continue;
      }
      const rings: [number, number][][] = [];
      for (const ring of target.rings) {
        if (!Array.isArray(ring)) {
          continue;
        }
        const normalizedRing: [number, number][] = [];
        for (const point of ring) {
          if (!Array.isArray(point) || point.length < 2) {
            continue;
          }
          const lon = Number(point[0]);
          const lat = Number(point[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            continue;
          }
          normalizedRing.push([lon, lat]);
        }
        if (normalizedRing.length) {
          rings.push(normalizedRing);
        }
      }
      if (!rings.length) {
        continue;
      }
      const sectionNormalized = target.section ?? null;
      const sectionValue =
        sectionNormalized === "front" || sectionNormalized === "middle" || sectionNormalized === "back"
          ? sectionNormalized
          : null;
      const priorityValue = Number.isFinite(target.priority ?? NaN)
        ? Number(target.priority)
        : null;
      targets.push({
        id: target.id ?? null,
        section: sectionValue,
        priority: priorityValue,
        rings,
      });
    }
  }
  return {
    sections,
    fatSide,
    pin,
    targets: targets.length ? targets : undefined,
  };
};

const resolveGreenMeta = (
  feature: CourseFeature | null | undefined,
  bundle: CourseBundle | null,
): GreenInfo | null => {
  if (!feature) {
    return null;
  }
  const id = typeof feature.id === "string" ? feature.id : null;
  if (id && bundle?.greensById && bundle.greensById[id]) {
    return normalizeGreenMeta(bundle.greensById[id]);
  }
  return normalizeGreenMeta(feature.green ?? null);
};

const prepareFeatures = (bundle: CourseBundle | null, frame: Frame | null): PreparedFeatures => {
  if (!bundle || !frame || !Array.isArray(bundle.features)) {
    return { hazards: [], fairways: [], greens: [], greenRings: [], cartpaths: [], greenTargets: [] };
  }
  const hazards: RiskFeature[] = [];
  const fairways: { x: number; y: number }[][] = [];
  const greens: PreparedGreen[] = [];
  const greenRings: { x: number; y: number }[][] = [];
  const cartpaths: { x: number; y: number }[][] = [];
  const greenTargets: PreparedTarget[] = [];
  for (const raw of bundle.features as CourseFeature[]) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const domType = normalizeFeatureType(raw);
    const geomType = raw?.geometry?.type;
    if (typeof geomType !== "string") {
      continue;
    }
    const normalizedType = geomType.toLowerCase();
    const isPoly = normalizedType === "polygon" || normalizedType === "multipolygon";
    const isLine = normalizedType === "linestring" || normalizedType === "multilinestring";
    if (domType === "fairway" && isPoly) {
      const rings = collectPolygonRings(frame, raw.geometry ?? {});
      if (rings.length) {
        fairways.push(...rings);
      }
    } else if (domType === "green" && isPoly) {
      const rings = collectPolygonRings(frame, raw.geometry ?? {});
      if (rings.length) {
        greenRings.push(...rings);
        greens.push({
          id: typeof raw.id === "string" ? raw.id : null,
          rings,
          meta: resolveGreenMeta(raw, bundle),
          centroid: computeGreenCentroid(rings),
          yRange: computeGreenYRange(rings),
        });
      }
    } else if ((domType === "hazard" || domType === "water" || domType === "bunker") && isPoly) {
      const rings = collectPolygonRings(frame, raw.geometry ?? {});
      if (rings.length) {
        hazards.push({ kind: "polygon", rings, penalty: hazardPenalty(domType) });
      }
    } else if (domType === "green_target" && isPoly) {
      const rings = collectPolygonRings(frame, raw.geometry ?? {});
      if (rings.length) {
        const sectionRaw =
          raw?.properties?.section ?? raw?.properties?.segment ?? raw?.properties?.label ?? null;
        const sectionNormalized =
          typeof sectionRaw === "string" ? sectionRaw.trim().toLowerCase() : "";
        const section =
          sectionNormalized === "front" || sectionNormalized === "middle" || sectionNormalized === "back"
            ? (sectionNormalized as GreenSection)
            : null;
        const priorityRaw = raw?.properties?.priority ?? raw?.properties?.order ?? raw?.properties?.rank;
        const priorityValue =
          typeof priorityRaw === "number"
            ? priorityRaw
            : typeof priorityRaw === "string"
              ? Number(priorityRaw)
              : null;
        greenTargets.push({
          id: typeof raw.id === "string" ? raw.id : null,
          rings,
          section,
          priority: Number.isFinite(priorityValue ?? NaN) ? Number(priorityValue) : null,
        });
      }
    } else if (domType === "cartpath" && isLine) {
      const lines = collectPolylines(frame, raw.geometry ?? {});
      for (const line of lines) {
        cartpaths.push(line);
      }
    } else {
      continue;
    }
  }
  for (const green of greens) {
    const targetMeta = green.meta?.targets;
    if (!Array.isArray(targetMeta)) {
      continue;
    }
    for (const target of targetMeta) {
      if (!target || !Array.isArray(target.rings)) {
        continue;
      }
      const localRings: { x: number; y: number }[][] = [];
      for (const ring of target.rings) {
        if (!Array.isArray(ring)) {
          continue;
        }
        const localRing: { x: number; y: number }[] = [];
        for (const point of ring) {
          if (!Array.isArray(point) || point.length < 2) {
            continue;
          }
          const lon = Number(point[0]);
          const lat = Number(point[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            continue;
          }
          const converted = toFramePoint(frame, [lon, lat]);
          if (converted) {
            localRing.push(converted);
          }
        }
        if (localRing.length >= 3) {
          localRings.push(localRing);
        }
      }
      if (!localRings.length) {
        continue;
      }
      greenTargets.push({
        id: target.id ?? green.id ?? null,
        rings: localRings,
        section: target.section ?? null,
        priority: target.priority ?? null,
      });
    }
  }
  return { hazards, fairways, greens, greenRings, cartpaths, greenTargets };
};

const ringContains = (point: { x: number; y: number }, ring: { x: number; y: number }[]): boolean => {
  if (!Array.isArray(ring) || ring.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersect = yi > point.y !== yj > point.y;
    if (intersect) {
      const slope = ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-6) + xi;
      if (slope > point.x) {
        inside = !inside;
      }
    }
  }
  return inside;
};

const polygonContains = (
  point: { x: number; y: number },
  polygons: { x: number; y: number }[][],
): boolean => {
  if (!Array.isArray(polygons) || polygons.length === 0) {
    return false;
  }
  let inside = false;
  for (const ring of polygons) {
    if (!ring || ring.length < 3) {
      continue;
    }
    if (ringContains(point, ring)) {
      inside = !inside;
    }
  }
  return inside;
};

const fairwayPenalty = (
  center: { x: number; y: number },
  longRadius: number,
  latRadius: number,
  fairways: { x: number; y: number }[][],
): number => {
  if (!fairways.length) {
    return 0.15;
  }
  const samples = sampleEllipsePoints(center, longRadius, latRadius);
  let outside = 0;
  for (const sample of samples) {
    if (!polygonContains(sample, fairways)) {
      outside += 1;
    }
  }
  const ratio = outside / samples.length;
  return clamp01(ratio * 0.6);
};

const greenPenalty = (
  center: { x: number; y: number },
  longRadius: number,
  latRadius: number,
  greenRings: { x: number; y: number }[][],
): number => {
  if (!greenRings.length) {
    return 0;
  }
  const samples = sampleEllipsePoints(center, longRadius, latRadius);
  let outside = 0;
  for (const sample of samples) {
    if (!polygonContains(sample, greenRings)) {
      outside += 1;
    }
  }
  const ratio = outside / samples.length;
  return clamp01(ratio * 0.5);
};

const selectActiveGreen = (
  greens: PreparedGreen[],
  pin: { x: number; y: number },
): PreparedGreen | null => {
  if (!greens.length) {
    return null;
  }
  for (const green of greens) {
    if (!green || !green.rings || !green.rings.length) {
      continue;
    }
    if (polygonContains(pin, green.rings)) {
      return green;
    }
  }
  let best: PreparedGreen | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const green of greens) {
    const centroid = green?.centroid;
    if (!centroid) {
      continue;
    }
    const distance = Math.hypot(pin.x - centroid.x, pin.y - centroid.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = green;
    }
  }
  return best;
};

const inferGreenSection = (
  pin: { x: number; y: number },
  green: PreparedGreen | null,
): GreenSection | null => {
  if (!green) {
    return null;
  }
  const availableSource = green.meta?.sections && green.meta.sections.length
    ? green.meta.sections
    : DEFAULT_GREEN_SECTIONS;
  const available: GreenSection[] = [];
  for (const section of availableSource) {
    if (!available.includes(section)) {
      available.push(section);
    }
  }
  if (!available.length) {
    available.push(...DEFAULT_GREEN_SECTIONS);
  }
  const range = green.yRange;
  if (!range) {
    return available.includes("middle") ? "middle" : available[0] ?? null;
  }
  const span = range.max - range.min;
  if (!Number.isFinite(span) || span <= 1) {
    return available.includes("middle") ? "middle" : available[0] ?? null;
  }
  const ratioRaw = (pin.y - range.min) / span;
  const ratio = Math.max(0, Math.min(1, ratioRaw));
  if (ratio <= 0.33 && available.includes("front")) {
    return "front";
  }
  if (ratio >= 0.67 && available.includes("back")) {
    return "back";
  }
  if (available.includes("middle")) {
    return "middle";
  }
  return available[0] ?? null;
};

const computeFatSideBias = (args: {
  fatSide: FatSide | null;
  hazards: RiskFeature[];
  greenRings: { x: number; y: number }[][];
  sigmaLong: number;
  sigmaLat: number;
  drift: number;
  distance: number;
  riskMode: RiskMode;
}): number => {
  const { fatSide, sigmaLat } = args;
  if (!fatSide) {
    return 0;
  }
  if (!Number.isFinite(sigmaLat) || sigmaLat < 3.5) {
    return 0;
  }
  const direction = fatSide === "L" ? -1 : 1;
  const thinDirection = -direction;
  const probe = Math.max(3.5, Math.min(8, sigmaLat * 0.9));
  const evaluate = (offset: number) => {
    const center = { x: offset + args.drift, y: args.distance };
    const hazard = ellipseOverlapRisk({
      center,
      longRadius_m: Math.max(1, args.sigmaLong),
      latRadius_m: Math.max(1, sigmaLat),
      features: args.hazards,
    });
    const green = greenPenalty(center, Math.max(1, args.sigmaLong), Math.max(1, sigmaLat), args.greenRings);
    return { hazard, green };
  };
  const thin = evaluate(probe * thinDirection);
  const fat = evaluate(probe * direction);
  const hazardDelta = Math.max(0, thin.hazard - fat.hazard);
  const greenDelta = Math.max(0, thin.green - fat.green);
  const pressure = hazardDelta + greenDelta * 0.6;
  if (pressure < 0.05 && thin.hazard < 0.08 && sigmaLat < 5) {
    return 0;
  }
  const dispersionFactor = Math.max(0, sigmaLat - 3.5) * 0.35;
  let magnitude = pressure * 4.2 + dispersionFactor;
  if (thin.hazard > 0.25) {
    magnitude += 0.5;
  }
  magnitude = Math.min(5, magnitude);
  const modeScale: Record<RiskMode, number> = { safe: 1, normal: 0.8, aggressive: 0.6 };
  magnitude *= modeScale[args.riskMode] ?? 1;
  if (magnitude < 0.6) {
    return 0;
  }
  return magnitude * direction;
};

const estimateFlightTime = (distance: number): number => {
  if (!Number.isFinite(distance) || distance <= 0) {
    return 0;
  }
  const clipped = Math.max(40, Math.min(320, distance));
  return Math.max(1.8, Math.min(4.8, clipped / 65));
};

const resolveWind = (wind: WindInput, headingDeg: number): { cross: number; head: number } => {
  const speed = Number.isFinite(wind?.speed_mps ?? NaN) ? Math.max(0, Number(wind?.speed_mps)) : 0;
  const fromDeg = Number.isFinite(wind?.from_deg ?? NaN) ? wrapDegrees(Number(wind?.from_deg)) : 0;
  if (speed === 0) {
    return { cross: 0, head: 0 };
  }
  const toDeg = wrapDegrees(fromDeg + 180);
  const diffRad = toRadians(toDeg - headingDeg);
  const cross = speed * Math.sin(diffRad);
  const head = speed * Math.cos(diffRad);
  return { cross, head };
};

const inferPar = (length: number): number => {
  if (!Number.isFinite(length)) {
    return 4;
  }
  if (length <= 180) {
    return 3;
  }
  if (length <= 430) {
    return 4;
  }
  return 5;
};

const viabilityPenalty = (
  remaining: number,
  par: number,
  goForGreen: boolean,
  maxCarry: number,
): number => {
  if (!Number.isFinite(remaining)) {
    return 0.2;
  }
  let penalty = 0;
  if (par <= 3) {
    if (remaining > 18) {
      penalty += 0.45;
    }
  } else if (par === 4) {
    if (remaining > 190) {
      penalty += 0.35;
    } else if (remaining < 60) {
      penalty += 0.12;
    }
  } else {
    if (remaining > maxCarry * 1.05) {
      penalty += 0.35;
    } else if (!goForGreen && remaining > 210) {
      penalty += 0.25;
    } else if (goForGreen && remaining > maxCarry * 0.9) {
      penalty += 0.18;
    }
  }
  return clamp01(penalty);
};

const aimDirection = (offset: number): "LEFT" | "RIGHT" | "STRAIGHT" => {
  if (Math.abs(offset) < 1) {
    return "STRAIGHT";
  }
  return offset < 0 ? "LEFT" : "RIGHT";
};

const aimMagnitudeDeg = (offset: number, distance: number): number => {
  if (!Number.isFinite(offset) || !Number.isFinite(distance) || distance <= 0) {
    return 0;
  }
  const rad = Math.atan2(Math.abs(offset), distance);
  return Math.abs((rad * 180) / Math.PI);
};

const selectClubForDistance = (distance: number, player: PlayerModel): ClubId => {
  let best: ClubId = CLUB_SEQUENCE[CLUB_SEQUENCE.length - 1];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const club of CLUB_SEQUENCE) {
    const stats = player.clubs[club];
    if (!stats) {
      continue;
    }
    const diff = Math.abs(stats.carry_m - distance);
    if (diff < bestDiff) {
      best = club;
      bestDiff = diff;
    }
    if (stats.carry_m >= distance && diff <= bestDiff + 2) {
      best = club;
      bestDiff = diff;
    }
  }
  return best;
};

export function dispersionEllipseForClub(
  club: ClubId,
  player: PlayerModel,
): { long_m: number; lat_m: number } {
  const stats = player.clubs[club];
  if (!stats) {
    return { long_m: 12, lat_m: 6 };
  }
  return {
    long_m: Math.max(1, stats.sigma_long_m),
    lat_m: Math.max(1, stats.sigma_lat_m),
  };
}

type TeeMcOptions = {
  useMC: boolean;
  samples?: number;
  seed?: number;
};

type ApproachMcOptions = {
  useMC: boolean;
  samples?: number;
  seed?: number;
};

const createTeeFallback = (
  args: TeePlanArgs,
  reason: string,
  wind?: { cross: number; head: number },
): ShotPlan => {
  const fallbackClub = CLUB_SEQUENCE[CLUB_SEQUENCE.length - 1];
  return {
    kind: "tee",
    club: fallbackClub,
    target: args.pin,
    aimDeg: 0,
    aimDirection: "STRAIGHT",
    reason,
    risk: 0,
    landing: { distance_m: 0, lateral_m: 0 },
    aim: { lateral_m: 0 },
    mode: args.riskMode,
    carry_m: 0,
    crosswind_mps: wind?.cross ?? 0,
    headwind_mps: wind?.head ?? 0,
    windDrift_m: 0,
    tuningActive: args.player.tuningActive,
    mc: null,
  };
};

const planTeeShotInternal = (args: TeePlanArgs, options: TeeMcOptions): ShotPlan => {
  const frame = buildFrame(args.tee, args.pin);
  if (!frame) {
    return createTeeFallback(args, "No course geometry available; aim straight at pin.");
  }
  const prepared = prepareFeatures(args.bundle, frame);
  const par = args.par ?? inferPar(frame.pin.y);
  const goForGreen = Boolean(args.goForGreen);
  const maxCarry = Math.max(
    ...CLUB_SEQUENCE.map((club) => args.player.clubs[club]?.carry_m ?? 0),
    0,
  );
  const wind = resolveWind(args.wind ?? null, frame.headingDeg);
  const candidates: TeeCandidate[] = [];
  for (const club of CLUB_SEQUENCE) {
    const stats = args.player.clubs[club];
    if (!stats || stats.carry_m <= 0) {
      continue;
    }
    const sigmaLong = stats.sigma_long_m * RISK_MULTIPLIER[args.riskMode];
    const sigmaLat = stats.sigma_lat_m * RISK_MULTIPLIER[args.riskMode];
    const minDist = Math.max(MIN_DISTANCE, stats.carry_m * 0.9);
    const maxDist = Math.min(stats.carry_m * 1.1, frame.pin.y + 40);
    for (let distance = minDist; distance <= maxDist; distance += STEP_METERS) {
      const flightTime = estimateFlightTime(distance);
      const drift = lateralWindOffset(wind.cross, flightTime);
      for (const aimOffset of AIM_OFFSETS_TEE) {
        const centerX = aimOffset + drift;
        const hazardRisk = ellipseOverlapRisk({
          center: { x: centerX, y: distance },
          longRadius_m: sigmaLong,
          latRadius_m: sigmaLat,
          features: prepared.hazards,
        });
        const fairwayRisk = fairwayPenalty(
          { x: centerX, y: distance },
          sigmaLong,
          sigmaLat,
          prepared.fairways,
        );
        const totalRisk = clamp01(hazardRisk + fairwayRisk);
        const remaining = Math.max(
          0,
          Math.hypot(frame.pin.x - centerX, frame.pin.y - distance),
        );
        const viability = viabilityPenalty(remaining, par, goForGreen, maxCarry);
        const combined = clamp01(totalRisk + viability);
        const aimDir = aimDirection(aimOffset);
        const aimDeg = aimMagnitudeDeg(aimOffset, distance);
        const aimDegSigned = aimOffset < 0 ? -aimDeg : aimDeg;
        candidates.push({
          club,
          carry: stats.carry_m,
          distance,
          aimOffset,
          aimDeg,
          aimDegSigned,
          aimDir,
          risk: totalRisk,
          combined,
          remaining,
          centerX,
          sigmaLong,
          sigmaLat,
        });
      }
    }
  }
  if (!candidates.length) {
    return createTeeFallback(args, "No candidates available; defaulting to straight shot.", wind);
  }
  const idealRemaining = par <= 3 ? 0 : par === 4 ? 140 : goForGreen ? 0 : 170;
  candidates.sort((a, b) => {
    if (a.combined !== b.combined) {
      return a.combined - b.combined;
    }
    const diffA = Math.abs(a.remaining - idealRemaining);
    const diffB = Math.abs(b.remaining - idealRemaining);
    if (diffA !== diffB) {
      return diffA - diffB;
    }
    return a.distance - b.distance;
  });
  let best = candidates[0];
  let mcResult: McResult | null = null;
  if (options.useMC) {
    const sampleCount = normalizeSamples(options.samples);
    const mcHazards = toMcHazards(prepared.hazards);
    const riskGate = readRiskGate();
    const evaluated: TeeCandidate[] = [];
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      const mc = runMonteCarloV1_5({
        samples: sampleCount,
        seed: options.seed !== undefined ? options.seed + i : undefined,
        range_m: candidate.distance,
        aimOffset_m: candidate.aimOffset,
        sigmaLong_m: candidate.sigmaLong,
        sigmaLat_m: candidate.sigmaLat,
        wind: { cross: wind.cross, head: wind.head },
        hazards: mcHazards,
        greenTargets: [],
        pin: frame.pin,
      });
      candidate.mc = mc;
      candidate.ev = mc.ev;
      evaluated.push(candidate);
    }
    const safe = evaluated.filter((candidate) => {
      const hazardRate = candidate.mc?.hazardRate ?? 1;
      return hazardRate <= riskGate;
    });
    const pool = (safe.length ? safe : evaluated).slice();
    pool.sort((a, b) => {
      const aEv = Number.isFinite(a.ev ?? NaN) ? Number(a.ev) : Number.NEGATIVE_INFINITY;
      const bEv = Number.isFinite(b.ev ?? NaN) ? Number(b.ev) : Number.NEGATIVE_INFINITY;
      if (aEv !== bEv) {
        return bEv - aEv;
      }
      const aHazard = a.mc?.hazardRate ?? 1;
      const bHazard = b.mc?.hazardRate ?? 1;
      if (aHazard !== bHazard) {
        return aHazard - bHazard;
      }
      return Math.abs(a.remaining - idealRemaining) - Math.abs(b.remaining - idealRemaining);
    });
    if (pool.length) {
      const selected = adjustCandidateForHazard(pool, pool[0], riskGate, args.riskMode);
      best = selected;
      mcResult = selected.mc ?? null;
    }
  }
  const targetLocal = {
    x: best.aimOffset,
    y: best.distance,
  };
  const targetGeo = fromLocal(args.tee, {
    x: targetLocal.x * frame.cos + targetLocal.y * frame.sin,
    y: -targetLocal.x * frame.sin + targetLocal.y * frame.cos,
  });
  const remainingLabel = Math.round(best.remaining);
  const reasonParts: string[] = [];
  reasonParts.push(`Leaves ${remainingLabel} m for next shot.`);
  if (best.aimDir !== "STRAIGHT") {
    reasonParts.push(`Aim ${best.aimDir.toLowerCase()} to clear hazards.`);
  }
  if (Math.abs(best.centerX) > 3) {
    reasonParts.push(`Expected lateral drift ${best.centerX.toFixed(1)} m.`);
  }
  if (mcResult) {
    const evText = `${mcResult.ev >= 0 ? "+" : ""}${mcResult.ev.toFixed(2)}`;
    reasonParts.push(
      `MC hazard ${(mcResult.hazardRate * 100).toFixed(0)}%, success ${(mcResult.successRate * 100).toFixed(0)}%, EV ${evText}.`,
    );
  } else {
    const riskPercent = Math.round(best.risk * 100);
    reasonParts.push(`Risk approx ${riskPercent}%.`);
  }
  return {
    kind: "tee",
    club: best.club,
    target: targetGeo,
    aimDeg: best.aimDeg,
    aimDirection: best.aimDir,
    reason: reasonParts.join(" "),
    risk: mcResult ? mcResult.hazardRate : best.combined,
    ev: mcResult?.ev,
    landing: { distance_m: best.distance, lateral_m: best.centerX },
    aim: { lateral_m: best.aimOffset },
    mode: args.riskMode,
    carry_m: best.carry,
    crosswind_mps: wind.cross,
    headwind_mps: wind.head,
    windDrift_m: best.centerX - best.aimOffset,
    tuningActive: args.player.tuningActive,
    mc: options.useMC ? mcResult : null,
    riskFactors: options.useMC ? formatMcReasons(mcResult) : undefined,
  };
};

export function planTeeShot(args: TeePlanArgs): ShotPlan {
  const normalized: TeePlanArgs = { ...args, riskMode: applyGameRiskBias(args.riskMode) };
  return planTeeShotInternal(normalized, { useMC: false });
}

export function planTeeShotMC(args: TeePlanArgs): ShotPlan {
  if (!args.useMC) {
    return planTeeShot(args);
  }
  const normalized: TeePlanArgs = { ...args, riskMode: applyGameRiskBias(args.riskMode) };
  return planTeeShotInternal(normalized, {
    useMC: true,
    samples: args.mcSamples,
    seed: args.mcSeed,
  });
}

const createApproachFallback = (args: ApproachPlanArgs, reason: string): ShotPlan => {
  const fallbackClub = selectClubForDistance(0, args.player);
  return {
    kind: "approach",
    club: fallbackClub,
    target: args.pin,
    aimDeg: 0,
    aimDirection: "STRAIGHT",
    reason,
    risk: 0,
    landing: { distance_m: 0, lateral_m: 0 },
    aim: { lateral_m: 0 },
    mode: args.riskMode,
    carry_m: 0,
    crosswind_mps: 0,
    headwind_mps: 0,
    windDrift_m: 0,
    tuningActive: args.player.tuningActive,
    mc: null,
    greenSection: null,
    fatSide: null,
  };
};

const planApproachInternal = (args: ApproachPlanArgs, options: ApproachMcOptions): ShotPlan => {
  const frame = buildFrame(args.ball, args.pin);
  if (!frame) {
    return createApproachFallback(args, "No geometry available; play straight at pin.");
  }
  const prepared = prepareFeatures(args.bundle, frame);
  const distance = Math.max(0, frame.pin.y);
  const preferredClub = args.preferredClub ?? selectClubForDistance(distance, args.player);
  const stats = args.player.clubs[preferredClub] ?? args.player.clubs[CLUB_SEQUENCE[0]]!;
  const sigmaLong = stats.sigma_long_m * RISK_MULTIPLIER[args.riskMode];
  const sigmaLat = stats.sigma_lat_m * RISK_MULTIPLIER[args.riskMode];
  const activeGreen = selectActiveGreen(prepared.greens, frame.pin);
  const selectedSection = inferGreenSection(frame.pin, activeGreen);
  const fatSide = activeGreen?.meta?.fatSide ?? null;
  const wind = resolveWind(args.wind ?? null, frame.headingDeg);
  const rangeForSim = distance || stats.carry_m;
  const flightTime = estimateFlightTime(rangeForSim);
  const drift = lateralWindOffset(wind.cross, flightTime);
  const fatBias = computeFatSideBias({
    fatSide,
    hazards: prepared.hazards,
    greenRings: prepared.greenRings,
    sigmaLong,
    sigmaLat,
    drift,
    distance,
    riskMode: args.riskMode,
  });
  const candidates: ApproachCandidate[] = [];
  const respectsFatSide = (candidate: ApproachCandidate | undefined): boolean => {
    if (!candidate || !fatSide) {
      return true;
    }
    if (Math.abs(candidate.aimOffset) <= OPPOSITE_AIM_THRESHOLD) {
      return true;
    }
    return fatSide === 'L' ? candidate.aimOffset <= 0 : candidate.aimOffset >= 0;
  };
  const selectFatSideAware = (list: ApproachCandidate[], fallback: ApproachCandidate): ApproachCandidate => {
    if (!fatSide) {
      return fallback;
    }
    const preferred = list.find((candidate) => respectsFatSide(candidate));
    return preferred ?? fallback;
  };
  for (const aimOffset of AIM_OFFSETS_APPROACH) {
    const biasedOffset = aimOffset + fatBias;
    const centerX = biasedOffset + drift;
    const hazardRisk = ellipseOverlapRisk({
      center: { x: centerX, y: distance },
      longRadius_m: sigmaLong,
      latRadius_m: sigmaLat,
      features: prepared.hazards,
    });
    const greenRisk = greenPenalty({ x: centerX, y: distance }, sigmaLong, sigmaLat, prepared.greenRings);
    const combined = clamp01(hazardRisk + greenRisk);
    const aimDeg = aimMagnitudeDeg(biasedOffset, rangeForSim);
    const aimDegSigned = biasedOffset < 0 ? -aimDeg : aimDeg;
    candidates.push({
      aimOffset: biasedOffset,
      aimDeg,
      aimDegSigned,
      aimDir: aimDirection(biasedOffset),
      risk: hazardRisk,
      combined,
      centerX,
      sigmaLong,
      sigmaLat,
    });
  }
  candidates.sort((a, b) => {
    if (a.combined !== b.combined) {
      return a.combined - b.combined;
    }
    const offA = Math.abs(a.aimOffset);
    const offB = Math.abs(b.aimOffset);
    if (offA !== offB) {
      return offA - offB;
    }
    return a.aimOffset - b.aimOffset;
  });
  let finalCandidate = selectFatSideAware(candidates, candidates[0]);
  let mcResult: McResult | null = null;
  if (options.useMC) {
    const sampleCount = normalizeSamples(options.samples);
    const mcHazards = toMcHazards(prepared.hazards);
    const mcTargets = toMcTargets(prepared.greenTargets, prepared.greenRings);
    const riskGate = readRiskGate();
    const evaluated: ApproachCandidate[] = [];
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      const mc = runMonteCarloV1_5({
        samples: sampleCount,
        seed: options.seed !== undefined ? options.seed + i : undefined,
        range_m: rangeForSim,
        aimOffset_m: candidate.aimOffset,
        sigmaLong_m: candidate.sigmaLong,
        sigmaLat_m: candidate.sigmaLat,
        wind: { cross: wind.cross, head: wind.head },
        hazards: mcHazards,
        greenTargets: mcTargets,
        pin: frame.pin,
      });
      candidate.mc = mc;
      candidate.ev = mc.ev;
      evaluated.push(candidate);
    }
    const safe = evaluated.filter((candidate) => (candidate.mc?.hazardRate ?? 1) <= riskGate);
    const pool = (safe.length ? safe : evaluated).slice();
    pool.sort((a, b) => {
      const aEv = Number.isFinite(a.ev ?? NaN) ? Number(a.ev) : Number.NEGATIVE_INFINITY;
      const bEv = Number.isFinite(b.ev ?? NaN) ? Number(b.ev) : Number.NEGATIVE_INFINITY;
      if (aEv !== bEv) {
        return bEv - aEv;
      }
      const aHazard = a.mc?.hazardRate ?? 1;
      const bHazard = b.mc?.hazardRate ?? 1;
      if (aHazard !== bHazard) {
        return aHazard - bHazard;
      }
      return Math.abs(a.aimOffset) - Math.abs(b.aimOffset);
    });
    if (pool.length) {
      const selected = adjustCandidateForHazard(pool, pool[0], riskGate, args.riskMode);
      finalCandidate = selectFatSideAware(pool, selected);
      mcResult = finalCandidate.mc ?? selected.mc ?? null;
    }
  }
  const targetLocal = { x: finalCandidate.aimOffset, y: distance };
  const targetGeo = fromLocal(args.ball, {
    x: targetLocal.x * frame.cos + targetLocal.y * frame.sin,
    y: -targetLocal.x * frame.sin + targetLocal.y * frame.cos,
  });
  const reasonParts: string[] = [];
  if (finalCandidate.aimDir !== "STRAIGHT") {
    reasonParts.push(`Favours ${finalCandidate.aimDir.toLowerCase()} side of green.`);
  } else {
    reasonParts.push("Play center of green.");
  }
  const riskValue = mcResult ? mcResult.hazardRate : finalCandidate.combined;
  const missLabel = riskValue > 0.4 ? "High risk – bail out." : `Risk ≈ ${Math.round(riskValue * 100)}%.`;
  reasonParts.push(missLabel);
  if (mcResult) {
    const evText = `${mcResult.ev >= 0 ? "+" : ""}${mcResult.ev.toFixed(2)}`;
    reasonParts.push(
      `MC hazard ${(mcResult.hazardRate * 100).toFixed(0)}%, success ${(mcResult.successRate * 100).toFixed(0)}%, EV ${evText}.`,
    );
  }
  return {
    kind: "approach",
    club: preferredClub,
    target: targetGeo,
    aimDeg: finalCandidate.aimDeg,
    aimDirection: finalCandidate.aimDir,
    reason: reasonParts.join(" "),
    risk: riskValue,
    ev: mcResult?.ev ?? finalCandidate.ev,
    landing: { distance_m: distance, lateral_m: finalCandidate.centerX },
    aim: { lateral_m: finalCandidate.aimOffset },
    mode: args.riskMode,
    carry_m: stats.carry_m,
    crosswind_mps: wind.cross,
    headwind_mps: wind.head,
    windDrift_m: finalCandidate.centerX - finalCandidate.aimOffset,
    tuningActive: args.player.tuningActive,
    mc: options.useMC ? mcResult : null,
    riskFactors: options.useMC ? formatMcReasons(mcResult) : undefined,
    greenSection: selectedSection ?? null,
    fatSide: fatSide ?? null,
  };
};

export function planApproach(args: ApproachPlanArgs): ShotPlan {
  const normalized: ApproachPlanArgs = { ...args, riskMode: applyGameRiskBias(args.riskMode) };
  return planApproachInternal(normalized, { useMC: false });
}

export function planApproachMC(args: ApproachPlanArgs): ShotPlan {
  if (!args.useMC) {
    return planApproach(args);
  }
  const normalized: ApproachPlanArgs = { ...args, riskMode: applyGameRiskBias(args.riskMode) };
  return planApproachInternal(normalized, {
    useMC: true,
    samples: args.mcSamples,
    seed: args.mcSeed,
  });
}

export { buildPlayerModel };

export const __test__ = {
  normalizeFeatureType,
  prepareFeatures,
  buildFrame,
};

export type HazardRates = {
  water: number;
  bunker: number;
  rough: number;
  ob: number;
  fairway: number;
};

export type Dispersion = {
  sigma_m: number;
  lateralSigma_m?: number;
};

export type TargetLane = {
  offset_m: number;
  carry_m: number;
};

type StrategyBounds = {
  minCarry_m?: number;
  maxCarry_m?: number;
  maxOffset_m?: number;
};

export type StrategyInput = {
  rawDist_m: number;
  playsLikeFactor: number;
  hazard: HazardRates;
  dispersion: Dispersion;
  laneWidth_m: number;
  profile: RiskProfile;
  bounds?: StrategyBounds;
  dangerSide?: 'left' | 'right' | null;
};

export type StrategyDecision = {
  profile: RiskProfile;
  recommended: TargetLane;
  evScore: number;
  breakdown: {
    distance: number;
    hazards: number;
    fairway: number;
    bias: number;
  };
};

type ScoreResult = {
  ev: number;
  breakdown: StrategyDecision['breakdown'];
};

const STRATEGY_OFFSET_STEPS = [-12, -8, -4, 0, 4, 8, 12] as const;
const STRATEGY_CARRY_STEPS = [-10, 0, 10] as const;

const roundKey = (value: number): number => Math.round(value * 100);

const sanitizeFinite = (value: number | null | undefined, fallback = 0): number => {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return fallback;
  }
  return Number(value);
};

const sanitizeDistance = (value: number | null | undefined, fallback = 0): number => {
  const numeric = sanitizeFinite(value, fallback);
  if (!(numeric > 0)) {
    return fallback;
  }
  return numeric;
};

const sanitizeProbability = (value: number | null | undefined): number => clamp01(Number(value ?? 0));

const dedupeNumbers = (values: number[]): number[] => {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    if (!Number.isFinite(value)) {
      continue;
    }
    const key = roundKey(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(Number(value));
  }
  if (!result.length) {
    result.push(0);
  }
  return result;
};

const clampBounds = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const resolveDangerSign = (input: StrategyInput): -1 | 0 | 1 => {
  if (input.dangerSide === 'left') {
    return -1;
  }
  if (input.dangerSide === 'right') {
    return 1;
  }
  return 0;
};

const normalizeDispersion = (dispersion: Dispersion): Dispersion => {
  const sigma = sanitizeDistance(dispersion?.sigma_m, 12);
  const lateral = sanitizeFinite(dispersion?.lateralSigma_m);
  const lateralSigma = lateral && lateral > 0 ? lateral : Math.max(4, sigma * 0.55);
  return {
    sigma_m: sigma,
    lateralSigma_m: lateralSigma,
  };
};

const normalizeHazards = (hazard: HazardRates): HazardRates => ({
  water: sanitizeProbability(hazard?.water),
  bunker: sanitizeProbability(hazard?.bunker),
  rough: sanitizeProbability(hazard?.rough),
  ob: sanitizeProbability(hazard?.ob),
  fairway: sanitizeProbability(hazard?.fairway),
});

const normalizeLaneWidth = (value: number): number => {
  const numeric = sanitizeDistance(value, 20);
  return numeric > 0 ? numeric : 20;
};

const createOffsetCandidates = (input: StrategyInput): number[] => {
  const bounds = input.bounds;
  const maxOffsetBound = bounds && Number.isFinite(bounds.maxOffset_m ?? Number.NaN)
    ? Math.abs(Number(bounds.maxOffset_m))
    : Number.NaN;
  const laneHalf = normalizeLaneWidth(input.laneWidth_m) / 2;
  const maxOffset = Number.isFinite(maxOffsetBound) && maxOffsetBound > 0 ? maxOffsetBound : laneHalf;
  const values = STRATEGY_OFFSET_STEPS.map((step) => clampBounds(step, -maxOffset, maxOffset));
  values.push(-maxOffset, maxOffset, 0);
  return dedupeNumbers(values).sort((a, b) => a - b);
};

const createCarryCandidates = (baseCarry: number, bounds: StrategyBounds | undefined): number[] => {
  const minCarryBound = bounds && Number.isFinite(bounds.minCarry_m ?? Number.NaN)
    ? Number(bounds.minCarry_m)
    : Number.NaN;
  const maxCarryBound = bounds && Number.isFinite(bounds.maxCarry_m ?? Number.NaN)
    ? Number(bounds.maxCarry_m)
    : Number.NaN;
  const minCarry = Number.isFinite(minCarryBound) ? Math.max(0, minCarryBound) : 0;
  const inferredMax = Number.isFinite(maxCarryBound) && maxCarryBound > 0 ? maxCarryBound : baseCarry + 30;
  const maxCarry = Math.max(minCarry, inferredMax);
  const candidates = STRATEGY_CARRY_STEPS.map((step) => clampBounds(baseCarry + step, minCarry, maxCarry));
  candidates.push(clampBounds(baseCarry, minCarry, maxCarry));
  return dedupeNumbers(candidates).sort((a, b) => a - b);
};

export function scoreEV(input: StrategyInput, lane: TargetLane, weights: StrategyWeights): ScoreResult {
  const hazards = normalizeHazards(input.hazard);
  const dispersion = normalizeDispersion(input.dispersion);
  const laneWidth = normalizeLaneWidth(input.laneWidth_m);
  const baseRaw = sanitizeDistance(input.rawDist_m, 0);
  const factor = sanitizeDistance(input.playsLikeFactor, 1) || 1;
  const targetCarry = sanitizeDistance(baseRaw * factor || baseRaw, baseRaw);

  const carry = sanitizeDistance(lane.carry_m, targetCarry);
  const offset = sanitizeFinite(lane.offset_m, 0);

  const diff = Math.abs(carry - targetCarry);
  const closeness = targetCarry > 0 ? Math.max(0, 1 - diff / Math.max(targetCarry, 1)) : 0;
  const distanceReward = weights.distanceReward * targetCarry * closeness;

  const hazardPenalty =
    hazards.water * weights.hazardWater +
    hazards.bunker * weights.hazardBunker +
    hazards.rough * weights.hazardRough +
    hazards.ob * weights.hazardOB;

  const fairwayBonus = hazards.fairway * weights.fairwayBonus;

  const dangerSign = resolveDangerSign(input);
  const fatSideBase = Math.max(0, weights.fatSideBias_m);
  const laneHalf = laneWidth / 2;
  const hazardDirectional = clamp01(hazards.water + hazards.ob);
  const hazardBoost = laneHalf * hazardDirectional * (0.5 + hazardDirectional);
  const fatSideTarget = Math.min(laneHalf, fatSideBase + hazardBoost);
  const lateralSigma = sanitizeFinite(dispersion.lateralSigma_m, dispersion.sigma_m);
  let biasPenalty = 0;
  if (dangerSign !== 0 && fatSideTarget > 0) {
    const offsetAway = dangerSign < 0 ? offset : -offset;
    const shortfall = fatSideTarget - offsetAway;
    if (shortfall > 0) {
      const normalized = Math.min(shortfall / Math.max(fatSideTarget, 1), 1);
      const dispersionFactor = 1 + Math.min(lateralSigma / Math.max(laneWidth / 2, 1), 1.5);
      const hazardSeverityBoost = 1 + hazards.water * 6 + hazards.ob * 3;
      biasPenalty = normalized * hazardDirectional * dispersionFactor * hazardSeverityBoost;
    }
  }

  const hazardsComponent = -hazardPenalty;
  const biasComponent = -biasPenalty;
  const breakdown = {
    distance: distanceReward,
    hazards: hazardsComponent,
    fairway: fairwayBonus,
    bias: biasComponent,
  } as const;
  const ev = distanceReward + hazardsComponent + fairwayBonus + biasComponent;
  return {
    ev: Number.isFinite(ev) ? ev : Number.NEGATIVE_INFINITY,
    breakdown,
  };
}

export function chooseStrategy(input: StrategyInput): StrategyDecision {
  const baseProfile: RiskProfile = STRATEGY_DEFAULTS[input.profile] ? input.profile : 'neutral';
  const profile = applyGameRiskProfile(baseProfile);
  const weights = STRATEGY_DEFAULTS[profile];
  const normalizedInput: StrategyInput = {
    ...input,
    profile,
    hazard: normalizeHazards(input.hazard),
    dispersion: normalizeDispersion(input.dispersion),
    laneWidth_m: normalizeLaneWidth(input.laneWidth_m),
    rawDist_m: sanitizeDistance(input.rawDist_m, 0),
    playsLikeFactor: sanitizeDistance(input.playsLikeFactor, 1) || 1,
    dangerSide: input.dangerSide ?? null,
  };

  const baseCarry = sanitizeDistance(
    normalizedInput.rawDist_m * normalizedInput.playsLikeFactor || normalizedInput.rawDist_m,
    normalizedInput.rawDist_m,
  );

  const offsets = createOffsetCandidates(normalizedInput);
  const carries = createCarryCandidates(baseCarry, normalizedInput.bounds);

  const candidates: TargetLane[] = [];
  for (const offset of offsets) {
    for (const carry of carries) {
      candidates.push({ offset_m: offset, carry_m: carry });
    }
  }

  if (!candidates.length) {
    const fallback: TargetLane = { offset_m: 0, carry_m: baseCarry || normalizedInput.rawDist_m };
    const score = scoreEV(normalizedInput, fallback, weights);
    return {
      profile,
      recommended: fallback,
      evScore: score.ev,
      breakdown: score.breakdown,
    };
  }

  let bestLane: TargetLane | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestBreakdown: StrategyDecision['breakdown'] = {
    distance: 0,
    hazards: 0,
    fairway: 0,
    bias: 0,
  };

  const targetCarry = baseCarry || normalizedInput.rawDist_m;

  for (const lane of candidates) {
    const { ev, breakdown } = scoreEV(normalizedInput, lane, weights);
    if (ev > bestScore + 1e-6) {
      bestScore = ev;
      bestLane = lane;
      bestBreakdown = breakdown;
      continue;
    }
    if (Math.abs(ev - bestScore) <= 1e-6 && bestLane) {
      const currentOffset = Math.abs(lane.offset_m);
      const bestOffset = Math.abs(bestLane.offset_m);
      if (currentOffset < bestOffset - 1e-3) {
        bestLane = lane;
        bestBreakdown = breakdown;
        continue;
      }
      if (Math.abs(currentOffset - bestOffset) <= 1e-3) {
        const currentCarryDiff = Math.abs(lane.carry_m - targetCarry);
        const bestCarryDiff = Math.abs(bestLane.carry_m - targetCarry);
        if (currentCarryDiff < bestCarryDiff - 1e-3) {
          bestLane = lane;
          bestBreakdown = breakdown;
        }
      }
    }
  }

  if (!bestLane) {
    const fallback: TargetLane = { offset_m: 0, carry_m: targetCarry };
    const { ev, breakdown } = scoreEV(normalizedInput, fallback, weights);
    return {
      profile,
      recommended: fallback,
      evScore: ev,
      breakdown,
    };
  }

  return {
    profile,
    recommended: bestLane,
    evScore: bestScore,
    breakdown: bestBreakdown,
  };
}

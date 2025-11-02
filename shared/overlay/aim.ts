import { BagStats, ClubStats, ClubId } from '../bag/types';
import { corridorPolygon, fitTransform, ringPolygon, XY } from './geom';

export type OverlayInput = {
  // hole vectors in local XY meters (already projected in our model)
  tee: XY;
  target: XY; // fairway center for tee, pin/middle for approach
  canvas: { w: number; h: number };
  bag: BagStats;
  club?: ClubId; // optional; if omitted pick longest viable non-putter
};

export type OverlayOut = {
  ring: XY[]; // landing ring polygon in screen coords
  corridor: XY[]; // aim corridor polygon in screen coords
  meta: {
    club: ClubId;
    p50_m: number;
    p25_m?: number;
    p75_m?: number;
    std_m?: number;
  };
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isViableClub = (stats: ClubStats | undefined): stats is ClubStats =>
  !!stats && stats.club !== 'Putter' && isFiniteNumber(stats.p50_m);

const longestViable = (bag: BagStats): ClubStats | undefined => {
  return Object.values(bag.clubs || {})
    .filter(isViableClub)
    .sort((a, b) => (b.p50_m ?? 0) - (a.p50_m ?? 0))[0];
};

const pickClub = (bag: BagStats, club?: ClubId): ClubStats | undefined => {
  if (club) {
    const explicit = bag.clubs?.[club];
    if (isViableClub(explicit)) {
      return explicit;
    }
  }
  return longestViable(bag);
};

const buildMeta = (clubId: ClubId, stats?: ClubStats) => {
  const meta: OverlayOut['meta'] = {
    club: clubId,
    p50_m: stats?.p50_m ?? 0,
  };

  const p25 = stats?.p25_m;
  if (isFiniteNumber(p25)) {
    meta.p25_m = p25;
  }

  const p75 = stats?.p75_m;
  if (isFiniteNumber(p75)) {
    meta.p75_m = p75;
  }

  const std = stats?.std_m;
  if (isFiniteNumber(std)) {
    meta.std_m = std;
  }

  return meta;
};

export function computeOverlay(input: OverlayInput): OverlayOut {
  const { tee, target, canvas, bag } = input;
  const clubStats = pickClub(bag, input.club);
  const clubId = clubStats?.club ?? input.club ?? 'Putter';

  const p50 = clubStats?.p50_m ?? 0;
  const p25 = clubStats?.p25_m ?? null;
  const p75 = clubStats?.p75_m ?? null;
  const std = clubStats?.std_m ?? null;

  const landingRadius_m = clamp(p50 * 0.08, 6, 40);
  const dispersionSource = isFiniteNumber(std)
    ? std * 2
    : isFiniteNumber(p75) && isFiniteNumber(p25)
      ? (p75 - p25) / 1.15
      : undefined;
  const corridorHalfWidth_m = clamp(dispersionSource ?? 6, 6, 35);

  const maxRadius = Math.max(landingRadius_m, corridorHalfWidth_m);
  const worldMin: XY = {
    x: Math.min(tee.x, target.x) - maxRadius,
    y: Math.min(tee.y, target.y) - maxRadius,
  };
  const worldMax: XY = {
    x: Math.max(tee.x, target.x) + maxRadius,
    y: Math.max(tee.y, target.y) + maxRadius,
  };

  const transform = fitTransform(worldMin, worldMax, canvas.w, canvas.h);
  const startScreen = transform.toScreen(tee);
  const endScreen = transform.toScreen(target);

  const ringRadiusPx = landingRadius_m * transform.scale;
  const corridorHalfWidthPx = corridorHalfWidth_m * transform.scale;

  const ring = ringPolygon(endScreen, ringRadiusPx);
  const corridor = corridorPolygon(startScreen, endScreen, corridorHalfWidthPx);

  return {
    ring,
    corridor,
    meta: buildMeta(clubId, clubStats),
  };
}

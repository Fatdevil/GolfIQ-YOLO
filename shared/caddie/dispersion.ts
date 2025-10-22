import { CLUB_SEQUENCE, type ClubId } from '../playslike/bag';
import type { Shot } from '../round/round_types';

export interface ClubDispersion {
  sigma_long_m: number;
  sigma_lat_m: number;
  n: number;
}

const EARTH_RADIUS_M = 6_378_137;
const MAD_SCALE = 1 / 0.6745; // ~= 1.4826
const Z_THRESHOLD = 2.5;
const ZERO_TOLERANCE = 1e-9;

type RelativePoint = { x: number; y: number };

function toFinite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function toClubId(value: string | null | undefined): ClubId | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const lookup = trimmed.toUpperCase();
  for (const club of CLUB_SEQUENCE) {
    if (lookup === club.toUpperCase()) {
      return club;
    }
  }
  return null;
}

function computeRelative(pin: { lat: number; lon: number }, land: { lat: number; lon: number }, headingDeg: number):
  | RelativePoint
  | null {
  if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lon) || !Number.isFinite(land.lat) || !Number.isFinite(land.lon)) {
    return null;
  }
  const heading = Number.isFinite(headingDeg) ? headingDeg : 0;
  const headingRad = (heading * Math.PI) / 180;
  const latRad = (pin.lat * Math.PI) / 180;
  const dLat = ((land.lat - pin.lat) * Math.PI) / 180;
  const dLon = ((land.lon - pin.lon) * Math.PI) / 180;
  const north = dLat * EARTH_RADIUS_M;
  const east = dLon * EARTH_RADIUS_M * Math.cos(latRad);
  const y = east * Math.sin(headingRad) + north * Math.cos(headingRad);
  const x = east * Math.cos(headingRad) - north * Math.sin(headingRad);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function mad(values: number[], med: number): number {
  if (values.length === 0) {
    return 0;
  }
  const deviations = values.map((value) => Math.abs(value - med));
  return median(deviations);
}

function stddev(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mu = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance = values.reduce((acc, value) => acc + (value - mu) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function buildKeepMask(longValues: number[], latValues: number[]): boolean[] {
  const longMedian = median(longValues);
  const latMedian = median(latValues);
  const longMad = mad(longValues, longMedian);
  const latMad = mad(latValues, latMedian);
  const longScale = longMad > 0 ? longMad * MAD_SCALE : 0;
  const latScale = latMad > 0 ? latMad * MAD_SCALE : 0;
  return longValues.map((value, index) => {
    const longDiff = Math.abs(value - longMedian);
    const latDiff = Math.abs(latValues[index] - latMedian);
    const longZ = longScale > 0 ? longDiff / longScale : longDiff <= ZERO_TOLERANCE ? 0 : Number.POSITIVE_INFINITY;
    const latZ = latScale > 0 ? latDiff / latScale : latDiff <= ZERO_TOLERANCE ? 0 : Number.POSITIVE_INFINITY;
    return longZ <= Z_THRESHOLD && latZ <= Z_THRESHOLD;
  });
}

export function learnDispersion(
  shots: Shot[],
  minN = 6,
): Partial<Record<ClubId, ClubDispersion>> {
  const perClub = new Map<ClubId, { long: number[]; lat: number[] }>();
  for (const shot of shots) {
    const club = toClubId(shot?.club ?? null);
    if (!club) {
      continue;
    }
    const carry = toFinite(shot?.carry_m);
    const planned = toFinite(shot?.playsLike_m);
    const heading = toFinite(shot?.heading_deg);
    if (carry === null || planned === null || heading === null || !shot?.pin || !shot?.land) {
      continue;
    }
    const relative = computeRelative(shot.pin, shot.land, heading);
    if (!relative) {
      continue;
    }
    const longErr = carry - planned;
    const latErr = relative.x;
    if (!Number.isFinite(longErr) || !Number.isFinite(latErr)) {
      continue;
    }
    if (!perClub.has(club)) {
      perClub.set(club, { long: [], lat: [] });
    }
    const entry = perClub.get(club)!;
    entry.long.push(longErr);
    entry.lat.push(latErr);
  }

  const result: Partial<Record<ClubId, ClubDispersion>> = {};
  for (const club of CLUB_SEQUENCE) {
    const entry = perClub.get(club);
    if (!entry || entry.long.length < minN || entry.lat.length < minN) {
      continue;
    }
    const keepMask = buildKeepMask(entry.long, entry.lat);
    const filteredLong: number[] = [];
    const filteredLat: number[] = [];
    for (let index = 0; index < keepMask.length; index += 1) {
      if (keepMask[index]) {
        filteredLong.push(entry.long[index]);
        filteredLat.push(entry.lat[index]);
      }
    }
    if (filteredLong.length === 0 || filteredLat.length === 0) {
      continue;
    }
    result[club] = {
      sigma_long_m: stddev(filteredLong),
      sigma_lat_m: stddev(filteredLat),
      n: filteredLong.length,
    };
  }

  return result;
}

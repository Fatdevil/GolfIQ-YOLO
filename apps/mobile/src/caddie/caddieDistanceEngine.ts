import type { ShotShapeProfile } from '@app/api/caddieApi';
import { computeEffectiveDistance } from './playsLike';

export interface PlaysLikeInput {
  targetDistanceM: number;
  windSpeedMps: number;
  windDirectionDeg: number;
  elevationDeltaM: number;
}

export interface PlaysLikeDetails {
  effectiveDistanceM: number;
  slopeAdjustM: number;
  windAdjustM: number;
}

export interface ClubCandidate {
  club: string;
  baselineCarryM: number;
  manualCarryM?: number | null;
  source: 'auto' | 'manual';
  samples?: number;
}

export interface RiskZone {
  carryMinM: number;
  carryMaxM: number;
  sideMinM: number;
  sideMaxM: number;
}

export interface ShotShapeRiskSummary {
  coreZone: RiskZone;
  fullZone: RiskZone;
  tailLeftProb: number;
  tailRightProb: number;
}

type ClubCandidateWithCarry = ClubCandidate & { effectiveCarry: number };

export function computePlaysLikeDetails(input: PlaysLikeInput): PlaysLikeDetails {
  const { effectiveDistance, breakdown } = computeEffectiveDistance(
    input.targetDistanceM,
    input.elevationDeltaM,
    input.windSpeedMps,
    input.windDirectionDeg,
  );

  return {
    effectiveDistanceM: effectiveDistance,
    slopeAdjustM: breakdown.slopeAdjust,
    windAdjustM: breakdown.windAdjust,
  };
}

export function computePlaysLikeDistance(input: PlaysLikeInput): number {
  return computePlaysLikeDetails(input).effectiveDistanceM;
}

function filterBySamples<T extends ClubCandidate>(clubs: T[]): T[] {
  const withSamples = clubs.filter((club) => (club.samples ?? 0) >= 3);
  return withSamples.length > 0 ? withSamples : clubs;
}

export function suggestClubForTarget(
  clubs: ClubCandidate[],
  input: PlaysLikeInput,
): ClubCandidate | null {
  if (!clubs.length) return null;

  const withEffectiveCarry: ClubCandidateWithCarry[] = clubs.map((club) => ({
    ...club,
    effectiveCarry:
      club.source === 'manual' && club.manualCarryM != null
        ? club.manualCarryM
        : club.baselineCarryM,
  }));

  const validClubs = filterBySamples(
    withEffectiveCarry.filter((club) => Number.isFinite(club.effectiveCarry) && club.effectiveCarry > 0),
  ).sort((a, b) => a.effectiveCarry - b.effectiveCarry);

  if (!validClubs.length) return null;

  const playsLike = computePlaysLikeDistance(input);
  const atOrAbove = validClubs.filter((club) => club.effectiveCarry >= playsLike);
  if (atOrAbove.length > 0) {
    return atOrAbove[0];
  }
  return validClubs[validClubs.length - 1];
}

const CORE_INTERVAL = 1.28;
const FULL_INTERVAL = 1.96;

export function computeRiskZonesFromProfile(profile: ShotShapeProfile): ShotShapeRiskSummary {
  const carryStd = Math.max(profile.coreCarryStdM, 0);
  const sideStd = Math.max(profile.coreSideStdM, 0);

  const coreZone: RiskZone = {
    carryMinM: profile.coreCarryMeanM - CORE_INTERVAL * carryStd,
    carryMaxM: profile.coreCarryMeanM + CORE_INTERVAL * carryStd,
    sideMinM: profile.coreSideMeanM - CORE_INTERVAL * sideStd,
    sideMaxM: profile.coreSideMeanM + CORE_INTERVAL * sideStd,
  };

  const fullZone: RiskZone = {
    carryMinM: profile.coreCarryMeanM - FULL_INTERVAL * carryStd,
    carryMaxM: profile.coreCarryMeanM + FULL_INTERVAL * carryStd,
    sideMinM: profile.coreSideMeanM - FULL_INTERVAL * sideStd,
    sideMaxM: profile.coreSideMeanM + FULL_INTERVAL * sideStd,
  };

  return {
    coreZone,
    fullZone,
    tailLeftProb: profile.tailLeftProb,
    tailRightProb: profile.tailRightProb,
  };
}

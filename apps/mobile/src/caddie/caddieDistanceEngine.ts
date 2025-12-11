import type { ShotShapeProfile } from '@app/api/caddieApi';
import type { PracticeDistanceProfile } from '@shared/caddie/practiceDistanceProfile';
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

export interface PracticeDistanceTelemetryPayload {
  clubId: string;
  practiceAvgCarryM: number;
  baselineCarryM: number;
  source: 'practice_profile' | 'baseline';
}

export interface SuggestClubOptions {
  practiceProfile?: PracticeDistanceProfile | null;
  minPracticeSamples?: number;
  onPracticeDistanceUsed?: (payload: PracticeDistanceTelemetryPayload) => void;
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

type CarrySource = 'baseline' | 'manual' | 'practice_profile';
type ClubCandidateWithCarry = ClubCandidate & { effectiveCarry: number; carrySource: CarrySource };

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

function resolveCarry(
  club: ClubCandidate,
  options: { practiceProfile?: PracticeDistanceProfile | null; minPracticeSamples?: number },
): { effectiveCarry: number; carrySource: CarrySource } {
  const manualCarry = club.source === 'manual' ? club.manualCarryM : null;
  if (manualCarry != null && Number.isFinite(manualCarry)) {
    return { effectiveCarry: manualCarry, carrySource: 'manual' };
  }

  const profileEntry = options.practiceProfile?.[club.club];
  const minPracticeSamples = options.minPracticeSamples ?? 5;
  if (
    profileEntry &&
    Number.isFinite(profileEntry.avgCarryM) &&
    profileEntry.avgCarryM > 0 &&
    profileEntry.sampleCount >= minPracticeSamples &&
    profileEntry.confidence === 'high'
  ) {
    return { effectiveCarry: profileEntry.avgCarryM, carrySource: 'practice_profile' };
  }

  return { effectiveCarry: club.baselineCarryM, carrySource: 'baseline' };
}

export function suggestClubForTarget(
  clubs: ClubCandidate[],
  input: PlaysLikeInput,
  options: SuggestClubOptions = {},
): ClubCandidate | null {
  if (!clubs.length) return null;

  const withEffectiveCarry: ClubCandidateWithCarry[] = clubs.map((club) => ({
    ...club,
    ...resolveCarry(club, {
      practiceProfile: options.practiceProfile,
      minPracticeSamples: options.minPracticeSamples,
    }),
  }));

  const validClubs = filterBySamples(
    withEffectiveCarry.filter((club) => Number.isFinite(club.effectiveCarry) && club.effectiveCarry > 0),
  ).sort((a, b) => a.effectiveCarry - b.effectiveCarry);

  if (!validClubs.length) return null;

  const playsLike = computePlaysLikeDistance(input);
  const atOrAbove = validClubs.filter((club) => club.effectiveCarry >= playsLike);
  const selected = atOrAbove.length > 0 ? atOrAbove[0] : validClubs[validClubs.length - 1];

  if (selected && selected.carrySource === 'practice_profile' && options.onPracticeDistanceUsed) {
    const practiceAvgCarryM = options.practiceProfile?.[selected.club]?.avgCarryM;
    if (practiceAvgCarryM != null) {
      options.onPracticeDistanceUsed({
        clubId: selected.club,
        practiceAvgCarryM,
        baselineCarryM: selected.baselineCarryM,
        source: 'practice_profile',
      });
    }
  }

  return selected;
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

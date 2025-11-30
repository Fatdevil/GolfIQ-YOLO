import type { RangeSessionSummary } from '@app/range/rangeSession';

export type RangeFocusArea = 'contact' | 'direction' | 'distance';

export interface RangeSessionStory {
  titleKey: string;
  focusArea: RangeFocusArea;
  strengths: string[];
  improvements: string[];
}

type DirectionStatus = 'good' | 'weak' | 'unknown';
type DistanceStatus = 'good' | 'weak' | 'unknown';

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function distanceTolerance(targetDistanceM: number): number {
  return Math.max(5, Math.abs(targetDistanceM) * 0.05);
}

export function buildRangeSessionStory(summary: RangeSessionSummary): RangeSessionStory {
  const strengths: string[] = [];
  const improvements: string[] = [];

  const hasCarry = typeof summary.avgCarryM === 'number' && !Number.isNaN(summary.avgCarryM);
  const hasTarget = typeof summary.targetDistanceM === 'number' && !Number.isNaN(summary.targetDistanceM);
  const hasSamples = summary.shotCount >= 3 && hasCarry;

  let directionStatus: DirectionStatus = 'unknown';
  if (summary.tendency) {
    directionStatus = summary.tendency === 'straight' ? 'good' : 'weak';
    if (directionStatus === 'good') {
      strengths.push('range.story.strengths.tight_direction');
    } else {
      improvements.push('range.story.improvements.direction');
    }
  }

  let distanceStatus: DistanceStatus = 'unknown';
  if (hasCarry && hasTarget) {
    const delta = summary.avgCarryM! - summary.targetDistanceM!;
    const tolerance = distanceTolerance(summary.targetDistanceM!);
    distanceStatus = Math.abs(delta) <= tolerance ? 'good' : 'weak';
    if (distanceStatus === 'good') {
      strengths.push('range.story.strengths.solid_distance');
    } else {
      improvements.push('range.story.improvements.distance');
    }
  }

  if (summary.shotCount >= 8) {
    strengths.push('range.story.strengths.good_volume');
  }

  if (!hasSamples) {
    improvements.push('range.story.improvements.contact');
  }

  let focusArea: RangeFocusArea = 'contact';
  let titleKey = 'range.story.consistent_hits_build_distance';

  if (!hasSamples) {
    focusArea = 'contact';
    titleKey = 'range.story.focus_on_contact';
  } else if (directionStatus === 'weak' && distanceStatus !== 'weak') {
    focusArea = 'direction';
    titleKey = 'range.story.solid_distance_work_on_direction';
  } else if (directionStatus === 'good' && distanceStatus === 'weak') {
    focusArea = 'distance';
    titleKey = 'range.story.good_direction_work_on_distance';
  } else if (directionStatus === 'weak' && distanceStatus === 'weak') {
    focusArea = 'direction';
    titleKey = 'range.story.direction_and_distance';
    improvements.push('range.story.improvements.distance');
  } else {
    focusArea = 'distance';
    titleKey = 'range.story.consistent_hits_build_distance';
    improvements.push('range.story.improvements.distance');
  }

  const finalStrengths = unique(strengths);
  const finalImprovements = unique(improvements);

  if (finalStrengths.length === 0) {
    finalStrengths.push('range.story.strengths.good_volume');
  }
  if (finalImprovements.length === 0) {
    finalImprovements.push('range.story.improvements.distance');
  }

  return {
    titleKey,
    focusArea,
    strengths: finalStrengths,
    improvements: finalImprovements,
  };
}

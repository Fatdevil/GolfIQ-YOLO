export type RangeMissionDifficulty = 'easy' | 'medium' | 'hard';

export type RangeMissionKind = 'generic' | 'distance' | 'direction' | 'tempo';

export interface RangeMission {
  id: string;
  titleKey: string;
  descriptionKey: string;
  recommendedClubs?: string[];
  recommendedShots?: number;
  difficulty?: RangeMissionDifficulty;
  kind?: RangeMissionKind;
  tempoTargetRatio?: number;
  tempoTolerance?: number;
  tempoRequiredSamples?: number;
}

export const RANGE_MISSIONS: RangeMission[] = [
  {
    id: 'solid_contact_wedges',
    titleKey: 'range.missionsCatalog.solid_contact_wedges_title',
    descriptionKey: 'range.missionsCatalog.solid_contact_wedges_body',
    recommendedClubs: ['PW', 'SW'],
    recommendedShots: 20,
    difficulty: 'easy',
    kind: 'generic',
  },
  {
    id: 'start_line_7iron',
    titleKey: 'range.missionsCatalog.start_line_7iron_title',
    descriptionKey: 'range.missionsCatalog.start_line_7iron_body',
    recommendedClubs: ['7i'],
    recommendedShots: 15,
    difficulty: 'medium',
    kind: 'direction',
  },
  {
    id: 'driver_shape',
    titleKey: 'range.missionsCatalog.driver_shape_title',
    descriptionKey: 'range.missionsCatalog.driver_shape_body',
    recommendedClubs: ['Driver'],
    recommendedShots: 12,
    difficulty: 'hard',
    kind: 'direction',
  },
  {
    id: 'distance_control_wedges',
    titleKey: 'range.missionsCatalog.distance_control_wedges_title',
    descriptionKey: 'range.missionsCatalog.distance_control_wedges_body',
    recommendedClubs: ['GW', 'SW'],
    recommendedShots: 18,
    difficulty: 'medium',
    kind: 'distance',
  },
  {
    id: 'tempo_find_baseline',
    titleKey: 'range.missionsCatalog.tempo_find_baseline_title',
    descriptionKey: 'range.missionsCatalog.tempo_find_baseline_body',
    recommendedShots: 20,
    difficulty: 'easy',
    kind: 'tempo',
    tempoTargetRatio: 3.0,
    tempoTolerance: 0.4,
    tempoRequiredSamples: 20,
  },
  {
    id: 'tempo_band_3_0',
    titleKey: 'range.missionsCatalog.tempo_band_3_0_title',
    descriptionKey: 'range.missionsCatalog.tempo_band_3_0_body',
    recommendedShots: 20,
    difficulty: 'medium',
    kind: 'tempo',
    tempoTargetRatio: 3.0,
    tempoTolerance: 0.2,
    tempoRequiredSamples: 20,
  },
];

export function getMissionById(id: string): RangeMission | undefined {
  return RANGE_MISSIONS.find((mission) => mission.id === id);
}

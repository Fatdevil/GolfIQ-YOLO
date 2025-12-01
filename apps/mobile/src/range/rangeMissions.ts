export type RangeMissionDifficulty = 'easy' | 'medium' | 'hard';

export interface RangeMission {
  id: string;
  titleKey: string;
  descriptionKey: string;
  recommendedClubs?: string[];
  recommendedShots?: number;
  difficulty?: RangeMissionDifficulty;
}

export const RANGE_MISSIONS: RangeMission[] = [
  {
    id: 'solid_contact_wedges',
    titleKey: 'range.missionsCatalog.solid_contact_wedges_title',
    descriptionKey: 'range.missionsCatalog.solid_contact_wedges_body',
    recommendedClubs: ['PW', 'SW'],
    recommendedShots: 20,
    difficulty: 'easy',
  },
  {
    id: 'start_line_7iron',
    titleKey: 'range.missionsCatalog.start_line_7iron_title',
    descriptionKey: 'range.missionsCatalog.start_line_7iron_body',
    recommendedClubs: ['7i'],
    recommendedShots: 15,
    difficulty: 'medium',
  },
  {
    id: 'driver_shape',
    titleKey: 'range.missionsCatalog.driver_shape_title',
    descriptionKey: 'range.missionsCatalog.driver_shape_body',
    recommendedClubs: ['Driver'],
    recommendedShots: 12,
    difficulty: 'hard',
  },
  {
    id: 'distance_control_wedges',
    titleKey: 'range.missionsCatalog.distance_control_wedges_title',
    descriptionKey: 'range.missionsCatalog.distance_control_wedges_body',
    recommendedClubs: ['GW', 'SW'],
    recommendedShots: 18,
    difficulty: 'medium',
  },
];

export function getMissionById(id: string): RangeMission | undefined {
  return RANGE_MISSIONS.find((mission) => mission.id === id);
}

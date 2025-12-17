export type DrillCategory = 'driving' | 'approach' | 'short_game' | 'putting' | 'tempo';

export type PracticeDrill = {
  id: string;
  category: DrillCategory;
  titleKey: string;
  descriptionKey: string;
  durationMin: number;
  tags: string[];
};

export const DRILLS_CATALOG: PracticeDrill[] = [
  {
    id: 'driving-alignment-check',
    category: 'driving',
    titleKey: 'practiceDrills.driving_alignment_title',
    descriptionKey: 'practiceDrills.driving_alignment_desc',
    durationMin: 10,
    tags: ['accuracy', 'start_line', 'setup'],
  },
  {
    id: 'driving-fairway-finder',
    category: 'driving',
    titleKey: 'practiceDrills.fairway_finder_title',
    descriptionKey: 'practiceDrills.fairway_finder_desc',
    durationMin: 12,
    tags: ['accuracy', 'fairways'],
  },
  {
    id: 'approach-distance-ladder',
    category: 'approach',
    titleKey: 'practiceDrills.approach_distance_title',
    descriptionKey: 'practiceDrills.approach_distance_desc',
    durationMin: 12,
    tags: ['distance_control', 'tempo'],
  },
  {
    id: 'approach-start-line',
    category: 'approach',
    titleKey: 'practiceDrills.approach_start_line_title',
    descriptionKey: 'practiceDrills.approach_start_line_desc',
    durationMin: 10,
    tags: ['start_line', 'contact'],
  },
  {
    id: 'shortgame-landing-ladder',
    category: 'short_game',
    titleKey: 'practiceDrills.shortgame_landing_title',
    descriptionKey: 'practiceDrills.shortgame_landing_desc',
    durationMin: 12,
    tags: ['landing_spot', 'distance_control'],
  },
  {
    id: 'shortgame-up-and-down',
    category: 'short_game',
    titleKey: 'practiceDrills.shortgame_updown_title',
    descriptionKey: 'practiceDrills.shortgame_updown_desc',
    durationMin: 10,
    tags: ['up_and_down', 'contact'],
  },
  {
    id: 'putting-lag-ladder',
    category: 'putting',
    titleKey: 'practiceDrills.putting_lag_title',
    descriptionKey: 'practiceDrills.putting_lag_desc',
    durationMin: 12,
    tags: ['lag_putting', 'speed'],
  },
  {
    id: 'putting-start-line-gate',
    category: 'putting',
    titleKey: 'practiceDrills.putting_gate_title',
    descriptionKey: 'practiceDrills.putting_gate_desc',
    durationMin: 10,
    tags: ['start_line', '3_putt'],
  },
  {
    id: 'putting-clean-up',
    category: 'putting',
    titleKey: 'practiceDrills.putting_cleanup_title',
    descriptionKey: 'practiceDrills.putting_cleanup_desc',
    durationMin: 8,
    tags: ['short_putts', '3_putt'],
  },
  {
    id: 'tempo-metronome-ladder',
    category: 'tempo',
    titleKey: 'practiceDrills.tempo_metronome_title',
    descriptionKey: 'practiceDrills.tempo_metronome_desc',
    durationMin: 8,
    tags: ['tempo', 'balance'],
  },
  {
    id: 'tempo-consistency-set',
    category: 'tempo',
    titleKey: 'practiceDrills.tempo_consistency_title',
    descriptionKey: 'practiceDrills.tempo_consistency_desc',
    durationMin: 10,
    tags: ['tempo', 'routine'],
  },
];

export function findDrillById(id: string): PracticeDrill | undefined {
  return DRILLS_CATALOG.find((drill) => drill.id === id);
}

export function drillsByCategory(category: DrillCategory): PracticeDrill[] {
  return DRILLS_CATALOG.filter((drill) => drill.category === category);
}

export type TrainingFocus =
  | 'long-drive'
  | 'tee'
  | 'approach'
  | 'wedge'
  | 'short'
  | 'putt'
  | 'recovery';

export interface CoachPersona {
  id: string;
  name: string;
  styleHints?: {
    tone?: 'concise' | 'neutral' | 'pep';
    verbosity?: 'short' | 'normal' | 'detailed';
  };
  focus: TrainingFocus[];
  premium?: boolean;
  version: string;
}

export interface Drill {
  id: string;
  focus: TrainingFocus;
  title: string;
  description: string;
  estTimeMin: number;
  prerequisites?: string[];
  requiredGear?: string[];
  targetMetric: {
    type: 'SG' | 'dispersion' | 'make%' | 'speed';
    segment: TrainingFocus;
  };
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface Plan {
  id: string;
  name: string;
  focus: TrainingFocus;
  version: string;
  drills: Array<{ id: string; reps?: number; durationMin?: number }>;
  schedule?: string;
  estTotalMin?: number;
}

export interface TrainingPack {
  packId: string;
  version: string;
  author?: string;
  updatedAt?: string;
  persona?: CoachPersona;
  drills: Drill[];
  plans: Plan[];
}

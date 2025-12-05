import { apiFetch } from './client';

export type DrillCategory = 'driving' | 'approach' | 'short_game' | 'putting' | 'mixed';

export type Drill = {
  id: string;
  name: string;
  description: string;
  category: DrillCategory;
  focusMetric: string;
  difficulty: 'easy' | 'medium' | 'hard';
  durationMinutes: number;
  recommendedBalls?: number | null;
};

export type PracticePlan = {
  focusCategories: DrillCategory[];
  drills: Drill[];
};

export async function fetchAllDrills(): Promise<Drill[]> {
  return apiFetch<Drill[]>('/api/coach/drills');
}

export async function fetchPracticePlan(params?: { maxMinutes?: number }): Promise<PracticePlan> {
  const query = params?.maxMinutes ? `?max_minutes=${params.maxMinutes}` : '';
  return apiFetch<PracticePlan>(`/api/coach/practice/plan${query}`);
}

export async function fetchPracticePlanFromDrills(params: {
  drillIds: string[];
  maxMinutes?: number;
}): Promise<PracticePlan> {
  return apiFetch<PracticePlan>('/api/coach/practice/plan-from-drills', {
    method: 'POST',
    body: JSON.stringify({
      drillIds: params.drillIds,
      maxMinutes: params.maxMinutes,
    }),
  });
}

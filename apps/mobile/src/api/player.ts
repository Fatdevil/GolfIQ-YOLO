import { apiFetch } from '@app/api/client';

export type PlanName = 'free' | 'pro';

export type AccessPlan = {
  plan: PlanName;
  trial?: boolean | null;
  expires_at?: string | null;
};

export type CoachCategory = 'tee' | 'approach' | 'short' | 'putt' | 'sequence' | 'strategy';

export type PlayerStrength = {
  category: CoachCategory;
  title: string;
  description?: string | null;
  evidence?: Record<string, unknown>;
};

export type PlayerWeakness = {
  category: CoachCategory;
  severity: 'focus' | 'critical';
  title: string;
  description?: string | null;
  evidence?: Record<string, unknown>;
};

export type DevelopmentStep = {
  week: number;
  title: string;
  description: string;
  focusCategory: CoachCategory;
  suggestedMissions?: string[];
};

export type PlayerModel = {
  playerType: string;
  style?: string | null;
  strengths: PlayerStrength[];
  weaknesses: PlayerWeakness[];
  consistencyScore?: number | null;
  developmentIndex?: number | null;
  referenceRunId?: string | null;
};

export type PlayerDevelopmentPlan = {
  focusCategories: CoachCategory[];
  steps: DevelopmentStep[];
};

export type PlayerProfile = {
  memberId: string;
  name?: string | null;
  model: PlayerModel;
  plan: PlayerDevelopmentPlan;
};

export type SgTrendPoint = {
  runId: string;
  date: string;
  sgTotal: number;
  sgTee: number;
  sgApproach: number;
  sgShort: number;
  sgPutt: number;
};

export type MissionStats = {
  totalMissions: number;
  completed: number;
  completionRate: number;
};

export type CategoryStatus = {
  category: Exclude<CoachCategory, 'strategy'>;
  recentTrend: 'improving' | 'stable' | 'worsening';
  lastSeverity: 'ok' | 'focus' | 'critical';
};

export type PlayerAnalytics = {
  memberId: string;
  sgTrend: SgTrendPoint[];
  categoryStatus: CategoryStatus[];
  missionStats: MissionStats;
  bestRoundId?: string | null;
  worstRoundId?: string | null;
};

export async function fetchPlayerProfile(): Promise<PlayerProfile> {
  return apiFetch<PlayerProfile>('/api/profile/player');
}

export async function fetchAccessPlan(): Promise<AccessPlan> {
  return apiFetch<AccessPlan>('/api/access/plan');
}

export async function fetchPlayerAnalytics(): Promise<PlayerAnalytics> {
  return apiFetch<PlayerAnalytics>('/api/analytics/player');
}

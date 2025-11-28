import { apiFetch } from "@/api";

export type AnalyticsCategory = "tee" | "approach" | "short" | "putt" | "sequence";
export type Trend = "improving" | "stable" | "worsening";
export type Severity = "ok" | "focus" | "critical";

export interface SgTrendPoint {
  runId: string;
  date: string;
  sgTotal: number;
  sgTee: number;
  sgApproach: number;
  sgShort: number;
  sgPutt: number;
}

export interface MissionStats {
  totalMissions: number;
  completed: number;
  completionRate: number;
}

export interface CategoryStatus {
  category: AnalyticsCategory;
  recentTrend: Trend;
  lastSeverity: Severity;
}

export interface PlayerAnalytics {
  memberId: string;
  sgTrend: SgTrendPoint[];
  categoryStatus: CategoryStatus[];
  missionStats: MissionStats;
  bestRoundId?: string | null;
  worstRoundId?: string | null;
}

export async function fetchPlayerAnalytics(): Promise<PlayerAnalytics> {
  const res = await apiFetch("/api/analytics/player");
  if (!res.ok) {
    throw new Error("Failed to load analytics");
  }
  return (await res.json()) as PlayerAnalytics;
}

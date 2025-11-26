import type { RangeShot } from "@/range/types";
import type { MissionId } from "@/features/range/missions";

export type RangeSessionId = string;

export type RangeGameType = "TARGET_BINGO_V1" | "GHOSTMATCH_V1";

export type RangeSession = {
  id: RangeSessionId;
  startedAt: string;
  endedAt: string;
  clubId?: string | null;

  missionId?: MissionId | null;
  missionGoodReps?: number | null;
  missionTargetReps?: number | null;

  avgCarry_m?: number | null;
  carryStd_m?: number | null;
  shotCount: number;

  target_m?: number | null;
  hitRate_pct?: number | null;
  avgError_m?: number | null;

  ghostSaved?: boolean;

  gameType?: RangeGameType;
  bingoLines?: number;
  bingoHits?: number;

  ghostSessionId?: string;
  ghostLabel?: string;
  ghostShots?: number;
  ghostScoreDelta?: number;
};

const STORAGE_KEY = "golfiq.range.sessions.v1";

export function loadRangeSessions(): RangeSession[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RangeSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RangeSession => item != null && typeof item === "object")
      .sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""));
  } catch {
    return [];
  }
}

export function saveRangeSessions(sessions: RangeSession[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // ignore
  }
}

export function appendRangeSession(session: RangeSession): void {
  const sessions = loadRangeSessions();
  sessions.unshift(session);
  const capped = sessions.slice(0, 50);
  saveRangeSessions(capped);
}

export function formatRangeSessionLabel(session: RangeSession): string {
  const dateLabel =
    typeof session.startedAt === "string" && session.startedAt.length >= 10
      ? session.startedAt.slice(0, 10)
      : "Unknown date";

  const descriptor =
    session.gameType === "TARGET_BINGO_V1"
      ? "Target Bingo"
      : session.clubId ?? "Range";

  const shotLabel = `${session.shotCount ?? 0} shots`;

  return [dateLabel, descriptor, shotLabel].join(" · ");
}

export function computeBasicStats(shots: RangeShot[]): {
  shotCount: number;
  avgCarry_m: number | null;
  carryStd_m: number | null;
} {
  const carries = shots
    .map((shot) => {
      const anyShot = shot as Record<string, unknown>;
      const direct = typeof anyShot.carry_m === "number" ? (anyShot.carry_m as number) : null;
      const metrics = (anyShot.metrics ?? {}) as Record<string, unknown>;
      const metricCarry = typeof metrics.carryM === "number" ? (metrics.carryM as number) : null;
      const metricCarryAlt = typeof metrics.carry_m === "number" ? (metrics.carry_m as number) : null;
      return direct ?? metricCarry ?? metricCarryAlt ?? null;
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

  const shotCount = carries.length;
  if (shotCount === 0) {
    return { shotCount: 0, avgCarry_m: null, carryStd_m: null };
  }

  const mean = carries.reduce((acc, value) => acc + value, 0) / shotCount;
  const variance = carries.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / shotCount;
  const std = Math.sqrt(variance);

  return {
    shotCount,
    avgCarry_m: mean,
    carryStd_m: std,
  };
}

export function getCoachTag(session: RangeSession): string {
  if (session.shotCount < 5) return "too_few_shots";
  if (
    session.missionId &&
    session.missionGoodReps != null &&
    session.missionTargetReps != null &&
    session.missionTargetReps > 0
  ) {
    const ratio = session.missionGoodReps / session.missionTargetReps;
    if (ratio >= 1) return "mission_completed";
    if (ratio >= 0.5) return "mission_progress";
  }
  if (session.carryStd_m != null && session.carryStd_m < 7) return "very_consistent_distance";
  if (session.hitRate_pct != null && session.hitRate_pct >= 70) return "high_hit_rate";
  return "mixed_results";
}

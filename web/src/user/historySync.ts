import type { QuickRound } from "@/features/quickround/types";
import type { RangeSession } from "@/features/range/sessions";
import type { QuickRoundSnapshot, RangeSessionSnapshot } from "./historyApi";

export function mapQuickRoundToSnapshot(round: QuickRound): QuickRoundSnapshot {
  const totalStrokes =
    round.holes?.reduce((sum, hole) => sum + (hole.strokes ?? 0), 0) ?? null;
  const parTotal = round.holes?.reduce((sum, hole) => sum + (hole.par ?? 0), 0) ?? null;

  let toPar: number | null = null;
  if (totalStrokes != null && parTotal != null) {
    toPar = totalStrokes - parTotal;
  }

  let netToPar: number | null = null;
  if (toPar != null && typeof round.handicap === "number") {
    const netStrokes = totalStrokes! - round.handicap;
    netToPar = netStrokes - parTotal!;
  }

  return {
    id: round.id ?? `qr-${round.startedAt}`,
    started_at: round.startedAt,
    completed_at: round.completedAt ?? null,
    course_name: round.courseName ?? null,
    total_strokes: totalStrokes,
    to_par: toPar,
    net_to_par: netToPar,
  };
}

export function mapRangeSessionToSnapshot(
  session: RangeSession
): RangeSessionSnapshot {
  return {
    id: session.id,
    started_at: session.startedAt,
    ended_at: session.endedAt,
    club_id: session.clubId ?? null,
    mission_id: session.missionId ?? null,
    shot_count: session.shotCount,
    avg_carry_m: session.avgCarry_m ?? null,
    carry_std_m: session.carryStd_m ?? null,
  };
}

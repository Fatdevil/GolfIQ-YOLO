import { describe, expect, it } from "vitest";

import { computeInsights } from "@/profile/insights";
import type { QuickRound } from "@/features/quickround/types";
import type { RangeSession } from "@/features/range/sessions";

function makeRound(
  id: string,
  totalPar: number,
  totalStrokes: number,
  handicap?: number | null
): QuickRound {
  return {
    id,
    courseName: id,
    holes: [
      {
        index: 1,
        par: totalPar,
        strokes: totalStrokes,
      },
    ],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    handicap: handicap ?? undefined,
  };
}

function makeRangeSession(partial: Partial<RangeSession> & { id: string }): RangeSession {
  const { id, ...rest } = partial;
  return {
    id,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    shotCount: 20,
    ...rest,
  } as RangeSession;
}

describe("computeInsights", () => {
  it("returns strengths, focuses and suggested mission based on data", () => {
    const rounds: QuickRound[] = [
      makeRound("good-1", 72, 68, 4),
      makeRound("good-2", 72, 70, 4),
      makeRound("bad-1", 72, 90),
      makeRound("bad-2", 72, 95),
    ];

    const rangeSessions: RangeSession[] = [
      makeRangeSession({
        id: "carry-1",
        carryStd_m: 5,
      }),
      makeRangeSession({
        id: "carry-2",
        carryStd_m: 4,
      }),
      makeRangeSession({
        id: "carry-3",
        carryStd_m: 6,
      }),
      makeRangeSession({
        id: "hit-1",
        hitRate_pct: 80,
      }),
      makeRangeSession({
        id: "hit-2",
        hitRate_pct: 72,
      }),
      makeRangeSession({
        id: "hit-3",
        hitRate_pct: 75,
      }),
      makeRangeSession({
        id: "mission-1",
        missionId: "wedge-ladder",
        missionGoodReps: 2,
        missionTargetReps: 10,
      }),
      makeRangeSession({
        id: "mission-2",
        missionId: "wedge-ladder",
        missionGoodReps: 3,
        missionTargetReps: 12,
      }),
      makeRangeSession({
        id: "mission-3",
        missionId: "stock-yardage",
        missionGoodReps: 2,
        missionTargetReps: 10,
      }),
      makeRangeSession({
        id: "mission-4",
        missionId: "stock-yardage",
        missionGoodReps: 1,
        missionTargetReps: 8,
      }),
    ];

    const result = computeInsights({ rounds, rangeSessions });

    expect(result.strengths.map((s) => s.id)).toContain("rounds.good_net_scoring");
    expect(result.strengths.map((s) => s.id)).toContain("range.consistent_carry");
    expect(result.strengths.map((s) => s.id)).toContain("range.good_hit_rate");
    expect(result.focuses.map((f) => f.id)).toContain("rounds.high_variance");
    expect(result.focuses.map((f) => f.id)).toContain("range.mission_completion_low");
    expect(result.suggestedMission).toBe("wedge-ladder");
  });
});

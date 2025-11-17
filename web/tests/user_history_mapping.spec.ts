import { describe, expect, it } from "vitest";

import { mapQuickRoundToSnapshot, mapRangeSessionToSnapshot } from "@/user/historySync";
import type { QuickRound } from "@/features/quickround/types";
import type { RangeSession } from "@/features/range/sessions";
import type { MissionId } from "@/features/range/missions";

describe("history mapping", () => {
  it("maps quick round and computes stroke deltas", () => {
    const round: QuickRound = {
      id: "qr-1",
      courseName: "Test Course",
      holes: [
        { index: 1, par: 4, strokes: 5 },
        { index: 2, par: 3, strokes: 4 },
        { index: 3, par: 5, strokes: 6 },
      ],
      startedAt: "2024-01-01T10:00:00.000Z",
      completedAt: "2024-01-01T12:00:00.000Z",
      handicap: 2,
    };

    const snapshot = mapQuickRoundToSnapshot(round);

    expect(snapshot.total_strokes).toBe(15);
    expect(snapshot.to_par).toBe(3);
    expect(snapshot.net_to_par).toBe(1);
    expect(snapshot.completed_at).toBe(round.completedAt);
  });

  it("maps range session fields", () => {
    const missionId: MissionId = "fairway-finder";
    const session: RangeSession = {
      id: "rs-1",
      startedAt: "2024-02-01T10:00:00.000Z",
      endedAt: "2024-02-01T11:00:00.000Z",
      clubId: "7i",
      missionId,
      shotCount: 12,
      avgCarry_m: 150,
      carryStd_m: 5.5,
    };

    const snapshot = mapRangeSessionToSnapshot(session);

    expect(snapshot).toMatchObject({
      id: session.id,
      started_at: session.startedAt,
      ended_at: session.endedAt,
      club_id: session.clubId,
      mission_id: session.missionId,
      shot_count: session.shotCount,
      avg_carry_m: session.avgCarry_m,
      carry_std_m: session.carryStd_m,
    });
  });
});

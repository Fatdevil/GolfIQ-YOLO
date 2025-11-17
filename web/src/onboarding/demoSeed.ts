import { saveBag } from "@/bag/storage";
import type { BagState } from "@/bag/types";
import { saveRangeSessions, type RangeSession } from "@/features/range/sessions";
import { saveQuickRoundsDemo } from "@/features/quickround/demoStorage";

export async function seedDemoData(): Promise<void> {
  try {
    const now = Date.now();

    const bag: BagState = {
      updatedAt: now,
      clubs: [
        { id: "DR", label: "Driver", carry_m: 230 },
        { id: "7i", label: "7-järn", carry_m: 150 },
        { id: "PW", label: "Pitching wedge", carry_m: 110 },
        { id: "SW", label: "Sand wedge", carry_m: 95 },
      ],
    };
    saveBag(bag);

    const sessions: RangeSession[] = [
      {
        id: "demo-rs-1",
        startedAt: new Date(now - 3 * 24 * 3600 * 1000).toISOString(),
        endedAt: new Date(now - 3 * 24 * 3600 * 1000 + 30 * 60 * 1000).toISOString(),
        clubId: "7i",
        missionId: "stock-yardage",
        missionGoodReps: 9,
        missionTargetReps: 8,
        avgCarry_m: 152,
        carryStd_m: 5,
        shotCount: 24,
        target_m: null,
        hitRate_pct: 78,
        avgError_m: 4,
        ghostSaved: true,
      },
      {
        id: "demo-rs-2",
        startedAt: new Date(now - 1 * 24 * 3600 * 1000).toISOString(),
        endedAt: new Date(now - 1 * 24 * 3600 * 1000 + 25 * 60 * 1000).toISOString(),
        clubId: "PW",
        missionId: "wedge-ladder",
        missionGoodReps: 10,
        missionTargetReps: 12,
        avgCarry_m: 108,
        carryStd_m: 6,
        shotCount: 20,
        target_m: 100,
        hitRate_pct: 72,
        avgError_m: 5,
        ghostSaved: false,
      },
    ];
    saveRangeSessions(sessions);

    saveQuickRoundsDemo();
  } catch {
    // best-effort; failures shouldn't crash the app
  }
}

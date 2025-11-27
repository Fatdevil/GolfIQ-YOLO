import { saveRound } from "@/features/quickround/storage";
import type { QuickRound } from "@/features/quickround/types";
import {
  appendRangeSession,
  loadRangeSessions,
  saveRangeSessions,
  type RangeSession,
} from "@/features/range/sessions";

export async function seedDemoData(): Promise<void> {
  seedDemoQuickRounds();
  seedDemoRangeSessions();
}

function seedDemoQuickRounds() {
  const now = Date.now();
  const demoRounds: QuickRound[] = [
    {
      id: "demo-round-1",
      runId: "demo-run-1",
      courseId: "demo_links",
      courseName: "Demo Links",
      teesName: "Yellow",
      holes: createDemoHoles([5, 4, 3, 5, 5, 4, 3, 4, 5]),
      startedAt: new Date(now - 7 * 24 * 3600_000).toISOString(),
      completedAt: new Date(now - 7 * 24 * 3600_000 + 2 * 3600_000).toISOString(),
      handicap: 10,
    },
    {
      id: "demo-round-2",
      runId: "demo-run-2",
      courseId: "demo_links",
      courseName: "Demo Links",
      teesName: "Blue",
      holes: createDemoHoles([4, 4, 3, 4, 5, 4, 3, 4, 4]),
      startedAt: new Date(now - 2 * 24 * 3600_000).toISOString(),
      completedAt: new Date(now - 2 * 24 * 3600_000 + 90 * 60_000).toISOString(),
      handicap: 8,
    },
  ];

  demoRounds.forEach((round) => saveRound(round));
}

function createDemoHoles(strokes: number[]) {
  return strokes.map((strokesTaken, index) => ({
    index: index + 1,
    par: index === 4 ? 5 : index % 3 === 0 ? 3 : 4,
    strokes: strokesTaken,
  }));
}

function seedDemoRangeSessions() {
  const now = Date.now();
  const sessions: RangeSession[] = [
    {
      id: "demo-range-1",
      startedAt: new Date(now - 5 * 24 * 3600_000).toISOString(),
      endedAt: new Date(now - 5 * 24 * 3600_000 + 40 * 60_000).toISOString(),
      shotCount: 30,
      avgCarry_m: 135,
      carryStd_m: 8,
      gameType: "TARGET_BINGO_V1",
      bingoLines: 2,
      bingoHits: 9,
    },
    {
      id: "demo-range-2",
      startedAt: new Date(now - 24 * 3600_000).toISOString(),
      endedAt: new Date(now - 24 * 3600_000 + 45 * 60_000).toISOString(),
      shotCount: 40,
      avgCarry_m: 140,
      carryStd_m: 12,
      gameType: "GHOSTMATCH_V1",
      ghostShots: 32,
      ghostScoreDelta: -3,
    },
  ];

  const existingSessions = loadRangeSessions();
  const existingIds = new Set(existingSessions.map((session) => session.id));
  const newSessions = sessions.filter((session) => !existingIds.has(session.id));

  if (newSessions.length === 0) {
    return;
  }

  newSessions.forEach((session) => appendRangeSession(session));

  const refreshedSessions = loadRangeSessions();
  saveRangeSessions(refreshedSessions.slice(0, 50));
}

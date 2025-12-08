import { beforeEach, describe, expect, it, vi } from "vitest";

import { persistMissionOutcomeFromSession } from "@/practice/missionOutcomeRecorder";
import type { RangeMission } from "@/range/missions";
import type { RangeShot } from "@/range/types";

const { recordPracticeMissionOutcomeMock } = vi.hoisted(() => ({
  recordPracticeMissionOutcomeMock: vi.fn(),
}));

vi.mock("@/practice/practiceMissionHistory", () => ({
  recordPracticeMissionOutcome: recordPracticeMissionOutcomeMock,
}));

const mission: RangeMission = {
  id: "approach_band_80_130",
  label: "Test mission",
  description: "",
  focusCategory: "short",
  targetBands: [],
  suggestedClubs: ["PW", "9i"],
};

const baseShot: RangeShot = {
  id: "shot-1",
  ts: Date.now(),
  club: "Pitching wedge",
  clubId: "PW",
  clubLabel: "Pitching wedge",
  metrics: {
    ballSpeedMps: 60,
    ballSpeedMph: 134,
    carryM: 120,
    launchDeg: 12,
    sideAngleDeg: 1,
    quality: "good",
  },
};

beforeEach(() => {
  recordPracticeMissionOutcomeMock.mockReset();
});

describe("persistMissionOutcomeFromSession", () => {
  it("records a mission outcome when target clubs are present", async () => {
    await persistMissionOutcomeFromSession(mission, [baseShot], {
      sessionId: "session-1",
      startedAt: "2024-01-01T00:00:00.000Z",
      endedAt: "2024-01-01T00:05:00.000Z",
      missionTargetReps: 5,
    });

    expect(recordPracticeMissionOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: mission.id,
        targetClubs: mission.suggestedClubs,
        completedSampleCount: 1,
        targetSampleCount: 5,
        sessionId: "session-1",
      }),
    );
  });

  it("does not record when no target club swings are logged", async () => {
    const offTargetShot: RangeShot = {
      ...baseShot,
      id: "shot-2",
      club: "7-iron",
      clubId: "7i",
      clubLabel: "7-iron",
    };

    await persistMissionOutcomeFromSession(mission, [offTargetShot], {
      sessionId: "session-2",
      startedAt: "2024-01-02T00:00:00.000Z",
      endedAt: "2024-01-02T00:03:00.000Z",
    });

    expect(recordPracticeMissionOutcomeMock).not.toHaveBeenCalled();
  });
});

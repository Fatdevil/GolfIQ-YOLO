import { afterEach, describe, expect, it, vi } from "vitest";

import {
  appendPracticeSessionResultEntry,
  loadPracticeSessionResults,
  summarizePracticeSessionProgress,
  clearPracticeSessionResultsForTests,
} from "@/practice/practiceSessionResults";

vi.mock("@/practice/practiceMissionHistory", () => ({
  PRACTICE_MISSION_WINDOW_DAYS: 14,
  loadPracticeMissionHistory: vi.fn(async () => []),
}));

afterEach(() => {
  clearPracticeSessionResultsForTests();
});

describe("practiceSessionResults", () => {
  it("persists appended results to localStorage", async () => {
    await appendPracticeSessionResultEntry({
      missionId: "test",
      completedAt: "2024-06-01T12:00:00.000Z",
      shotsAttempted: 10,
    });

    const stored = await loadPracticeSessionResults();
    expect(stored).toHaveLength(1);
    expect(stored[0].missionId).toBe("test");
  });

  it("computes streak and window counts", async () => {
    const now = new Date("2024-06-03T12:00:00.000Z");
    await appendPracticeSessionResultEntry({ missionId: "a", completedAt: "2024-06-03T10:00:00.000Z", shotsAttempted: 5 });
    await appendPracticeSessionResultEntry({ missionId: "b", completedAt: "2024-06-02T10:00:00.000Z", shotsAttempted: 5 });

    const progress = await summarizePracticeSessionProgress(now);
    expect(progress.consecutiveDays).toBe(2);
    expect(progress.lastSevenDays).toBe(2);
  });
});

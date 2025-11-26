import { describe, expect, it } from "vitest";

import {
  createGhostMatchStats,
  incrementGhostStats,
} from "@/features/range/ghostMatch";
import {
  formatRangeSessionLabel,
  type RangeSession,
} from "@/features/range/sessions";

describe("Range GhostMatch helpers", () => {
  it("formats a compact label for range sessions", () => {
    const session: RangeSession = {
      id: "rs-1",
      startedAt: "2025-05-10T10:00:00.000Z",
      endedAt: "2025-05-10T11:00:00.000Z",
      clubId: "7i",
      shotCount: 32,
    };

    expect(formatRangeSessionLabel(session)).toBe("2025-05-10 · 7i · 32 shots");
  });

  it("tracks ghost stats as shots are registered", () => {
    const ghost: RangeSession = {
      id: "ghost-1",
      startedAt: "2025-05-01T08:00:00.000Z",
      endedAt: "2025-05-01T09:00:00.000Z",
      shotCount: 3,
    };

    let stats = createGhostMatchStats(ghost);
    expect(stats).toEqual({ currentShots: 0, ghostShots: 3, deltaShots: 0 });

    stats = incrementGhostStats(stats);
    expect(stats).toEqual({ currentShots: 1, ghostShots: 3, deltaShots: -2 });

    stats = incrementGhostStats(stats);
    expect(stats).toEqual({ currentShots: 2, ghostShots: 3, deltaShots: -1 });

    stats = incrementGhostStats(stats);
    expect(stats).toEqual({ currentShots: 3, ghostShots: 3, deltaShots: 0 });
  });
});

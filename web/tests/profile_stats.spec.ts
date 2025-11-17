import { describe, expect, it } from "vitest";

import {
  computeBagSummary,
  computeQuickRoundStats,
  computeRangeSummary,
} from "@/profile/stats";
import type { QuickRound } from "@/features/quickround/types";
import type { GhostProfile } from "@/features/range/ghost";
import type { BagState } from "@/bag/types";

describe("profile stats helpers", () => {
  it("computes quick round aggregates", () => {
    const now = new Date().toISOString();
    const rounds: QuickRound[] = [
      {
        id: "r1",
        courseName: "Oak Park",
        holes: [
          { index: 1, par: 4, strokes: 5 },
          { index: 2, par: 3, strokes: 3 },
        ],
        startedAt: now,
        completedAt: now,
        handicap: 2,
      },
      {
        id: "r2",
        courseName: "Pine Hills",
        holes: [
          { index: 1, par: 4, strokes: 4 },
          { index: 2, par: 3, strokes: 2 },
        ],
        startedAt: now,
        completedAt: now,
        handicap: 1,
      },
      {
        id: "r3",
        courseName: "Halfway",
        holes: [
          { index: 1, par: 4 },
          { index: 2, par: 3 },
        ],
        startedAt: now,
      },
    ];

    const stats = computeQuickRoundStats(rounds);

    expect(stats.totalRounds).toBe(3);
    expect(stats.completedRounds).toBe(2);
    expect(stats.avgStrokes).toBeCloseTo(7);
    expect(stats.avgToPar).toBeCloseTo(0);
    expect(stats.bestToPar).toBe(-1);
  });

  it("handles quick rounds without scores", () => {
    const now = new Date().toISOString();
    const rounds: QuickRound[] = [
      {
        id: "r1",
        courseName: "No Scores",
        holes: [
          { index: 1, par: 4 },
          { index: 2, par: 3 },
        ],
        startedAt: now,
        completedAt: now,
      },
    ];

    const stats = computeQuickRoundStats(rounds);

    expect(stats.totalRounds).toBe(1);
    expect(stats.completedRounds).toBe(1);
    expect(stats.avgStrokes).toBeUndefined();
    expect(stats.avgToPar).toBeUndefined();
    expect(stats.bestToPar).toBeUndefined();
  });

  it("summarises range ghosts", () => {
    const ghosts: GhostProfile[] = [
      {
        id: "g2",
        name: "Back Nine",
        createdAt: 20,
        config: { target_m: 150, tolerance_m: 5, maxShots: 20 },
        result: { totalShots: 20, hits: 10, hitRate_pct: 50, avgAbsError_m: 2 },
      },
      {
        id: "g1",
        name: "Front Nine",
        createdAt: 10,
        config: { target_m: 140, tolerance_m: 7, maxShots: 15 },
        result: { totalShots: 18, hits: 8, hitRate_pct: 44, avgAbsError_m: null },
      },
    ];

    const stats = computeRangeSummary(ghosts);

    expect(stats.ghostCount).toBe(2);
    expect(stats.lastGhost?.id).toBe("g2");
  });

  it("summarises bag carry distances", () => {
    const bag: BagState = {
      updatedAt: Date.now(),
      clubs: [
        { id: "DR", label: "Driver", carry_m: 250 },
        { id: "7i", label: "7i", carry_m: null },
        { id: "PW", label: "PW", carry_m: 110 },
      ],
    };

    const stats = computeBagSummary(bag);

    expect(stats.totalClubs).toBe(3);
    expect(stats.clubsWithCarry).toBe(2);
  });
});

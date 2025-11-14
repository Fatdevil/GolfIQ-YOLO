import { describe, expect, it } from "vitest";

import {
  buildRangeShareSummary,
  scoreTargetBingo,
  type TargetBingoConfig,
} from "@web/features/range/games";
import type { RangeShot, RangeSessionSummary } from "@web/range/types";

const makeShot = (carryM: number, sideDeg: number): RangeShot => ({
  id: `shot-${carryM}-${sideDeg}`,
  ts: 0,
  club: "7i",
  metrics: {
    ballSpeedMps: 60,
    ballSpeedMph: 134,
    carryM,
    launchDeg: null,
    sideAngleDeg: sideDeg,
    quality: "good",
  },
});

describe("buildRangeShareSummary", () => {
  it("creates a shareable summary payload", () => {
    const shots = [makeShot(150, 0), makeShot(152, 1)];
    const bingoConfig: TargetBingoConfig = {
      target_m: 150,
      tolerance_m: 5,
      maxShots: 10,
    };
    const sessionSummary: RangeSessionSummary = {
      shots: shots.length,
      avgBallSpeedMps: 60,
      avgCarryM: 151,
      dispersionSideDeg: 1.5,
    };

    const bingoResult = scoreTargetBingo(shots, bingoConfig);
    const share = buildRangeShareSummary({
      mode: "target-bingo",
      bingoConfig,
      shots,
      bingoResult,
      sessionSummary,
    });

    expect(share.mode).toBe("target-bingo");
    expect(share.totalShots).toBe(2);
    expect(share.bingo?.hits).toBe(2);
    expect(share.bingo?.totalShots).toBe(2);
    expect(share.sessionAverages.carry_m).toBe(151);

    const text = JSON.stringify(share);
    expect(text).toContain("sessionAverages");
    expect(text).toContain("totalShots");
  });
});

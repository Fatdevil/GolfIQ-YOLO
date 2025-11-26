import { describe, expect, it } from "vitest";

import {
  createDefaultTargetBingoConfig,
  createInitialBingoState,
  registerShotOnBingo,
} from "@/features/range/games/types";

describe("Target Bingo state helpers", () => {
  it("initializes hits to zero for all bands", () => {
    const config = createDefaultTargetBingoConfig();
    const state = createInitialBingoState(config);

    expect(state.totalShots).toBe(0);
    const hits = Object.values(state.hitsByCell);
    expect(hits.every((value) => value === 0)).toBe(true);
  });

  it("registers hits inside the matching band", () => {
    const config = createDefaultTargetBingoConfig();
    const state = createInitialBingoState(config);

    const afterFirst = registerShotOnBingo(state, 65);
    expect(afterFirst.totalShots).toBe(1);
    expect(afterFirst.hitsByCell["60-70"]).toBe(1);

    const afterMiss = registerShotOnBingo(afterFirst, null);
    expect(afterMiss.totalShots).toBe(2);
    expect(afterMiss.hitsByCell["60-70"]).toBe(1);
  });

  it("marks completed lines across rows, columns, and diagonals", () => {
    const config = createDefaultTargetBingoConfig();
    const state = createInitialBingoState(config);

    const rowComplete = [55, 65, 75].reduce(
      (current, carry) => registerShotOnBingo(current, carry),
      state
    );

    expect(rowComplete.completedLines).toBe(1);
    expect(rowComplete.isComplete).toBe(true);

    const diagComplete = [95, 55, 125, 115, 135].reduce(
      (current, carry) => registerShotOnBingo(current, carry),
      state
    );

    expect(diagComplete.completedLines).toBeGreaterThanOrEqual(2);
    expect(diagComplete.isComplete).toBe(true);
  });
});

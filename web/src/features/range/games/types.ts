export type BingoCellId = string;

export interface TargetBand {
  id: BingoCellId;
  minCarry_m: number;
  maxCarry_m: number;
}

export interface TargetBingoConfig {
  id: "TARGET_BINGO_V1";
  name: string;
  description: string;
  bands: TargetBand[];
  columns: number;
  rows: number;
}

export interface TargetBingoState {
  config: TargetBingoConfig;
  hitsByCell: Record<BingoCellId, number>;
  totalShots: number;
  completedLines: number;
  isComplete: boolean;
}

export function createDefaultTargetBingoConfig(): TargetBingoConfig {
  const bands: TargetBand[] = [
    { id: "50-60", minCarry_m: 50, maxCarry_m: 60 },
    { id: "60-70", minCarry_m: 60, maxCarry_m: 70 },
    { id: "70-80", minCarry_m: 70, maxCarry_m: 80 },
    { id: "80-90", minCarry_m: 80, maxCarry_m: 90 },
    { id: "90-100", minCarry_m: 90, maxCarry_m: 100 },
    { id: "100-110", minCarry_m: 100, maxCarry_m: 110 },
    { id: "110-120", minCarry_m: 110, maxCarry_m: 120 },
    { id: "120-130", minCarry_m: 120, maxCarry_m: 130 },
    { id: "130-140", minCarry_m: 130, maxCarry_m: 140 },
  ];

  return {
    id: "TARGET_BINGO_V1",
    name: "Target Bingo",
    description: "Hit distance bands on the range to complete bingo lines.",
    bands,
    columns: 3,
    rows: 3,
  };
}

export function createInitialBingoState(
  config: TargetBingoConfig,
): TargetBingoState {
  return {
    config,
    hitsByCell: Object.fromEntries(config.bands.map((band) => [band.id, 0])),
    totalShots: 0,
    completedLines: 0,
    isComplete: false,
  };
}

function countCompletedLines(state: TargetBingoState): number {
  const { config, hitsByCell } = state;
  const grid: TargetBand[][] = [];
  for (let r = 0; r < config.rows; r += 1) {
    const rowStart = r * config.columns;
    grid.push(config.bands.slice(rowStart, rowStart + config.columns));
  }

  const isBandHit = (band: TargetBand) => (hitsByCell[band.id] ?? 0) > 0;

  let completed = 0;

  // Rows
  for (const row of grid) {
    if (row.length === config.columns && row.every(isBandHit)) {
      completed += 1;
    }
  }

  // Columns
  for (let c = 0; c < config.columns; c += 1) {
    const columnBands = grid.map((row) => row[c]).filter(Boolean) as TargetBand[];
    if (columnBands.length === config.rows && columnBands.every(isBandHit)) {
      completed += 1;
    }
  }

  // Diagonals (only when rows === columns)
  if (config.rows === config.columns) {
    const diag1 = grid.map((row, idx) => row[idx]).filter(Boolean) as TargetBand[];
    const diag2 = grid
      .map((row, idx) => row[config.columns - idx - 1])
      .filter(Boolean) as TargetBand[];

    if (diag1.length === config.rows && diag1.every(isBandHit)) {
      completed += 1;
    }
    if (diag2.length === config.rows && diag2.every(isBandHit)) {
      completed += 1;
    }
  }

  return completed;
}

export function registerShotOnBingo(
  state: TargetBingoState,
  carry_m: number | null | undefined,
): TargetBingoState {
  const nextHits = { ...state.hitsByCell };
  const totalShots = state.totalShots + 1;

  if (typeof carry_m === "number" && Number.isFinite(carry_m)) {
    const band = state.config.bands.find(
      (candidate) =>
        carry_m >= candidate.minCarry_m && carry_m < candidate.maxCarry_m,
    );
    if (band) {
      nextHits[band.id] = (nextHits[band.id] ?? 0) + 1;
    }
  }

  const nextState: TargetBingoState = {
    ...state,
    hitsByCell: nextHits,
    totalShots,
    completedLines: 0,
    isComplete: false,
  };

  const completedLines = countCompletedLines(nextState);

  return {
    ...nextState,
    completedLines,
    isComplete: completedLines > 0,
  };
}

import { RangeShot, RangeSessionSummary } from "@web/range/types";

export type TargetBingoConfig = {
  target_m: number;
  tolerance_m: number;
  maxShots: number;
};

export type TargetBingoShot = {
  index: number;
  shot: RangeShot;
  carryError_m: number;
  isHit: boolean;
};

export type TargetBingoResult = {
  shots: TargetBingoShot[];
  totalShots: number;
  hits: number;
  misses: number;
  hitRate_pct: number;
  avgAbsError_m: number | null;
};

const isFinitePositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function scoreTargetBingo(
  allShots: RangeShot[],
  cfg: TargetBingoConfig
): TargetBingoResult {
  const maxShots = Math.max(0, Math.floor(cfg.maxShots));
  if (maxShots === 0 || allShots.length === 0) {
    return {
      shots: [],
      totalShots: 0,
      hits: 0,
      misses: 0,
      hitRate_pct: 0,
      avgAbsError_m: null,
    };
  }

  const startIndex = Math.max(allShots.length - maxShots, 0);
  const recentShots = allShots.slice(startIndex);

  const scored = recentShots
    .map((shot, idx) => {
      const carry = shot.metrics.carryM;
      if (!isFinitePositiveNumber(carry)) {
        return null;
      }

      const index = startIndex + idx + 1;
      const carryError_m = carry - cfg.target_m;
      const isHit = Math.abs(carryError_m) <= cfg.tolerance_m;

      return {
        index,
        shot,
        carryError_m,
        isHit,
      } satisfies TargetBingoShot;
    })
    .filter((value): value is TargetBingoShot => value != null);

  const totalShots = scored.length;
  const hits = scored.filter((shot) => shot.isHit).length;
  const misses = totalShots - hits;
  const hitRate_pct = totalShots > 0 ? (hits / totalShots) * 100 : 0;
  const avgAbsError_m =
    totalShots > 0
      ? scored.reduce((acc, shot) => acc + Math.abs(shot.carryError_m), 0) / totalShots
      : null;

  return {
    shots: scored,
    totalShots,
    hits,
    misses,
    hitRate_pct,
    avgAbsError_m,
  };
}

export type SprayPoint = {
  x_m: number;
  y_m: number;
};

export type SprayBin = {
  key: string;
  xCenter_m: number;
  yCenter_m: number;
  count: number;
};

export function shotToSprayPoint(shot: RangeShot): SprayPoint | null {
  const carry = shot.metrics.carryM;
  const side = shot.metrics.sideAngleDeg;

  if (!isFinitePositiveNumber(carry) || typeof side !== "number" || !Number.isFinite(side)) {
    return null;
  }

  const angleRad = side * (Math.PI / 180);
  const y = carry * Math.tan(angleRad);

  return {
    x_m: carry,
    y_m: y,
  };
}

export function buildSprayBins(shots: RangeShot[], binSize_m: number): SprayBin[] {
  const binSize = Math.max(0, binSize_m);
  if (binSize === 0) {
    return [];
  }

  const bins = new Map<
    string,
    {
      xCenter_m: number;
      yCenter_m: number;
      count: number;
    }
  >();

  for (const shot of shots) {
    const point = shotToSprayPoint(shot);
    if (!point) {
      continue;
    }

    const ix = Math.floor(point.x_m / binSize);
    const iy = Math.floor(point.y_m / binSize);
    const key = `${ix}:${iy}`;

    const xCenter_m = (ix + 0.5) * binSize;
    const yCenter_m = (iy + 0.5) * binSize;

    const existing = bins.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      bins.set(key, {
        xCenter_m,
        yCenter_m,
        count: 1,
      });
    }
  }

  return Array.from(bins.entries()).map(([key, value]) => ({
    key,
    xCenter_m: value.xCenter_m,
    yCenter_m: value.yCenter_m,
    count: value.count,
  }));
}

export type RangeShareSummary = {
  mode: string;
  target_m: number;
  tolerance_m: number;
  totalShots: number;
  bingo: {
    totalShots: number;
    hits: number;
    hitRate_pct: number;
    avgAbsError_m: number | null;
  } | null;
  sessionAverages: {
    ballSpeed_mps: number | null;
    carry_m: number | null;
    dispersion_m: number | null;
  };
};

export function buildRangeShareSummary(args: {
  mode: string;
  bingoConfig: TargetBingoConfig;
  shots: RangeShot[];
  bingoResult: TargetBingoResult | null;
  sessionSummary: RangeSessionSummary;
}): RangeShareSummary {
  const { mode, bingoConfig, shots, bingoResult, sessionSummary } = args;

  return {
    mode,
    target_m: bingoConfig.target_m,
    tolerance_m: bingoConfig.tolerance_m,
    totalShots: shots.length,
    bingo: bingoResult
      ? {
          totalShots: bingoResult.totalShots,
          hits: bingoResult.hits,
          hitRate_pct: bingoResult.hitRate_pct,
          avgAbsError_m: bingoResult.avgAbsError_m,
        }
      : null,
    sessionAverages: {
      ballSpeed_mps: sessionSummary.avgBallSpeedMps,
      carry_m: sessionSummary.avgCarryM,
      dispersion_m: sessionSummary.dispersionSideDeg,
    },
  };
}

import { RangeShot, RangeSessionSummary } from "./types";

export function computeRangeSummary(shots: RangeShot[]): RangeSessionSummary {
  if (shots.length === 0) {
    return {
      shots: 0,
      avgBallSpeedMps: null,
      avgCarryM: null,
      dispersionSideDeg: null,
    };
  }

  const validSpeed = shots
    .map((shot) => shot.metrics.ballSpeedMps)
    .filter((value): value is number => value != null);
  const validCarry = shots
    .map((shot) => shot.metrics.carryM)
    .filter((value): value is number => value != null);
  const side = shots
    .map((shot) => shot.metrics.sideAngleDeg)
    .filter((value): value is number => value != null);

  const avg = (values: number[]) =>
    values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : null;

  const avgSpeed = avg(validSpeed);
  const avgCarry = avg(validCarry);

  let dispersion: number | null = null;
  if (side.length) {
    const mean = avg(side)!;
    const squared = side.reduce((acc, value) => acc + (value - mean) * (value - mean), 0);
    dispersion = Math.sqrt(squared / side.length);
  }

  return {
    shots: shots.length,
    avgBallSpeedMps: avgSpeed,
    avgCarryM: avgCarry,
    dispersionSideDeg: dispersion,
  };
}

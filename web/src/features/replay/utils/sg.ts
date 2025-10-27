import type { ParsedRound } from "./parseRound";
import type { Shot } from "./parseShotLog";

export type SgSummary = {
  count: number;
  total: number;
  tee: number;
  approach: number;
  short: number;
  putt: number;
  adopted: { count: number; average: number | null };
  notAdopted: { count: number; average: number | null };
  lift: number | null;
};

export type HoleAggregate = {
  id: string;
  label: string;
  holeNo: number | null;
  par: number | null;
  total: number;
  tee: number;
  approach: number;
  short: number;
  putt: number;
  shots: Shot[];
};

const sumValues = (values: number[]): number => values.reduce((acc, value) => acc + value, 0);

const mean = (values: number[]): number | null => {
  if (!values.length) {
    return null;
  }
  return sumValues(values) / values.length;
};

export function summarizeShots(shots: Shot[]): SgSummary {
  const sgShots = shots.filter((shot) => shot.sg && Number.isFinite(shot.sg.total ?? Number.NaN));
  const total = sumValues(
    sgShots
      .map((shot) => Number(shot.sg?.total))
      .filter((value): value is number => Number.isFinite(value)),
  );
  const tee = sumValues(
    sgShots
      .map((shot) => Number(shot.sg?.tee))
      .filter((value): value is number => Number.isFinite(value)),
  );
  const approach = sumValues(
    sgShots
      .map((shot) => Number(shot.sg?.approach))
      .filter((value): value is number => Number.isFinite(value)),
  );
  const short = sumValues(
    sgShots
      .map((shot) => Number(shot.sg?.short))
      .filter((value): value is number => Number.isFinite(value)),
  );
  const putt = sumValues(
    sgShots
      .map((shot) => Number(shot.sg?.putt))
      .filter((value): value is number => Number.isFinite(value)),
  );

  const adoptedValues: number[] = [];
  const otherValues: number[] = [];
  sgShots.forEach((shot) => {
    const totalValue = Number(shot.sg?.total);
    if (!Number.isFinite(totalValue)) {
      return;
    }
    if (shot.planAdopted === true) {
      adoptedValues.push(totalValue);
    } else if (shot.planAdopted === false) {
      otherValues.push(totalValue);
    }
  });

  const adoptedAverage = mean(adoptedValues);
  const otherAverage = mean(otherValues);
  const lift =
    adoptedAverage !== null && otherAverage !== null ? adoptedAverage - otherAverage : null;

  return {
    count: sgShots.length,
    total,
    tee,
    approach,
    short,
    putt,
    adopted: { count: adoptedValues.length, average: adoptedAverage },
    notAdopted: { count: otherValues.length, average: otherAverage },
    lift,
  };
}

function buildAggregate(
  id: string,
  label: string,
  shots: Shot[],
  holeNo: number | null,
  par: number | null,
): HoleAggregate {
  const sgShots = shots.filter((shot) => shot.sg && Number.isFinite(shot.sg.total ?? Number.NaN));
  const total = sumValues(
    sgShots
      .map((shot) => Number(shot.sg?.total))
      .filter((value): value is number => Number.isFinite(value)),
  );
  const tee = sumValues(
    sgShots
      .map((shot) => Number(shot.sg?.tee))
      .filter((value): value is number => Number.isFinite(value)),
  );
  const approach = sumValues(
    sgShots
      .map((shot) => Number(shot.sg?.approach))
      .filter((value): value is number => Number.isFinite(value)),
  );
  const short = sumValues(
    sgShots
      .map((shot) => Number(shot.sg?.short))
      .filter((value): value is number => Number.isFinite(value)),
  );
  const putt = sumValues(
    sgShots
      .map((shot) => Number(shot.sg?.putt))
      .filter((value): value is number => Number.isFinite(value)),
  );

  return { id, label, holeNo, par, total, tee, approach, short, putt, shots };
}

export function groupShotsByHole(shots: Shot[], round: ParsedRound | null): HoleAggregate[] {
  if (!shots.length) {
    return [];
  }
  const aggregates: HoleAggregate[] = [];
  if (round && round.holes.length) {
    let cursor = 0;
    round.holes.forEach((hole, index) => {
      const label = `Hole ${hole.holeNo}`;
      const holeShots: Shot[] = [];
      const strokeCount = Number.isFinite(hole.strokes)
        ? Math.max(0, Math.trunc(hole.strokes))
        : 0;
      for (let i = 0; i < strokeCount && cursor < shots.length; i += 1) {
        holeShots.push(shots[cursor]);
        cursor += 1;
      }
      if (holeShots.length) {
        aggregates.push(
          buildAggregate(`hole-${index + 1}`, label, holeShots, hole.holeNo, hole.par ?? null),
        );
      }
    });
    if (cursor < shots.length) {
      const leftover = shots.slice(cursor);
      aggregates.push(
        buildAggregate(
          `segment-${aggregates.length + 1}`,
          `Segment ${aggregates.length + 1}`,
          leftover,
          null,
          null,
        ),
      );
    }
    return aggregates;
  }

  let segmentIndex = 1;
  let current: Shot[] = [];
  shots.forEach((shot, index) => {
    const isSegmentStart = shot.phase === 'tee' && current.length;
    if (isSegmentStart) {
      aggregates.push(
        buildAggregate(
          `segment-${segmentIndex}`,
          `Segment ${segmentIndex}`,
          current,
          null,
          null,
        ),
      );
      segmentIndex += 1;
      current = [];
    }
    current.push(shot);
    const isLast = index === shots.length - 1;
    if (isLast && current.length) {
      aggregates.push(
        buildAggregate(
          `segment-${segmentIndex}`,
          `Segment ${segmentIndex}`,
          current,
          null,
          null,
        ),
      );
    }
  });

  return aggregates;
}

import type { Shot } from "../../features/replay/utils/parseShotLog";

let autoId = 0;

const nextId = () => {
  autoId += 1;
  return `shot-${autoId}`;
};

export const makeShot = (overrides: Partial<Shot> = {}): Shot => {
  const base: Shot = {
    shotId: nextId(),
    tStart: null,
    tEnd: null,
    durationMs: null,
    club: null,
    base_m: null,
    playsLike_m: null,
    carry_m: 150,
    heading_deg: null,
    pin: null,
    land: null,
    deltas: { temp: null, alt: null, head: null, slope: null },
    relative: { x: 0, y: 0, distance: 0 },
    notes: null,
    phase: "approach",
    sg: {
      tee: 0,
      approach: 0,
      short: 0,
      putt: 0,
      total: 0,
      expStart: 0,
      expEnd: 0,
      strokes: 1,
    },
    planAdopted: false,
    evBefore: 0,
    evAfter: 0,
    endDist_m: null,
    holed: null,
  };

  const hasRelative = Object.prototype.hasOwnProperty.call(overrides, "relative");
  const hasSg = Object.prototype.hasOwnProperty.call(overrides, "sg");
  const hasPlan = Object.prototype.hasOwnProperty.call(overrides, "planAdopted");
  const hasEvBefore = Object.prototype.hasOwnProperty.call(overrides, "evBefore");
  const hasEvAfter = Object.prototype.hasOwnProperty.call(overrides, "evAfter");

  return {
    ...base,
    ...overrides,
    shotId: overrides.shotId ?? base.shotId,
    deltas: overrides.deltas ?? base.deltas,
    relative: hasRelative ? overrides.relative ?? null : base.relative,
    sg: hasSg ? overrides.sg ?? null : base.sg,
    planAdopted: hasPlan ? overrides.planAdopted ?? null : base.planAdopted,
    evBefore: hasEvBefore ? overrides.evBefore ?? null : base.evBefore,
    evAfter: hasEvAfter ? overrides.evAfter ?? null : base.evAfter,
  };
};

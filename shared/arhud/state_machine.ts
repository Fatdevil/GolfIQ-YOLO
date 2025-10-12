export type HudState = "AIM" | "CALIBRATE" | "TRACK" | "RECENTER";
export type HudEvent =
  | "aimAcquired"
  | "calibrated"
  | "trackingLost"
  | "recenterRequested"
  | "recentered";

const INITIAL_STATE: HudState = "AIM";

const transitions: Record<HudState, Partial<Record<HudEvent, HudState>>> = {
  AIM: {
    aimAcquired: "CALIBRATE",
  },
  CALIBRATE: {
    calibrated: "TRACK",
    trackingLost: "AIM",
  },
  TRACK: {
    trackingLost: "CALIBRATE",
    recenterRequested: "RECENTER",
  },
  RECENTER: {
    recentered: "TRACK",
    trackingLost: "CALIBRATE",
  },
};

export interface HudStateMachine {
  current: () => HudState;
  dispatch: (event: HudEvent) => HudState;
  reset: () => void;
}

export function createHudStateMachine(initial: HudState = INITIAL_STATE): HudStateMachine {
  let state: HudState = initial;

  return {
    current: () => state,
    dispatch: (event: HudEvent) => {
      const next = transitions[state]?.[event];
      if (!next) {
        return state;
      }
      state = next;
      return state;
    },
    reset: () => {
      state = initial;
    },
  };
}

export const hudInitialState = INITIAL_STATE;

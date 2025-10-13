export type ArhudState = "AIM" | "CALIBRATE" | "TRACK" | "RECENTER";
export type ArhudEvent =
  | "aimAcquired"
  | "calibrated"
  | "trackingLost"
  | "recenterRequested"
  | "recentered";

const TRANSITIONS: Record<ArhudState, Partial<Record<ArhudEvent, ArhudState>>> = {
  AIM: {
    aimAcquired: "CALIBRATE",
  },
  CALIBRATE: {
    calibrated: "TRACK",
    trackingLost: "AIM",
  },
  TRACK: {
    trackingLost: "AIM",
    recenterRequested: "RECENTER",
  },
  RECENTER: {
    recentered: "TRACK",
    trackingLost: "AIM",
  },
};

const INITIAL_STATE: ArhudState = "AIM";

export interface ArhudStateMachine {
  current: () => ArhudState;
  dispatch: (event: ArhudEvent) => ArhudState;
  reset: () => ArhudState;
}

export function createArhudStateMachine(
  initialState: ArhudState = INITIAL_STATE,
): ArhudStateMachine {
  let state: ArhudState = initialState;
  const baseline = initialState;

  return {
    current: () => state,
    dispatch: (event: ArhudEvent) => {
      const next = TRANSITIONS[state]?.[event];
      if (next) {
        state = next;
      }
      return state;
    },
    reset: () => {
      state = baseline;
      return state;
    },
  };
}

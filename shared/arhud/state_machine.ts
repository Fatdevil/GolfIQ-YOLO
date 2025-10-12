export type ArhudState = "AIM" | "CALIBRATE" | "TRACK" | "RECENTER";
export type ArhudEvent =
  | "aimAcquired"
  | "calibrated"
  | "trackingLost"
  | "recenterRequested"
  | "recentered";

const INITIAL_STATE: ArhudState = "AIM";

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

export type StateMachine = {
  current: () => ArhudState;
  dispatch: (event: ArhudEvent) => ArhudState;
  reset: () => void;
};

export function createStateMachine(initial: ArhudState = INITIAL_STATE): StateMachine {
  let state: ArhudState = initial;

  const current = () => state;

  const dispatch = (event: ArhudEvent): ArhudState => {
    const next = TRANSITIONS[state]?.[event];
    if (!next) {
      return state;
    }
    state = next;
    return state;
  };

  const reset = () => {
    state = INITIAL_STATE;
  };

  return { current, dispatch, reset };
}

export function allowedTransitions(state: ArhudState): Partial<Record<ArhudEvent, ArhudState>> {
  return { ...TRANSITIONS[state] };
}

export const STATES: readonly ArhudState[] = ["AIM", "CALIBRATE", "TRACK", "RECENTER"] as const;
export const EVENTS: readonly ArhudEvent[] = [
  "aimAcquired",
  "calibrated",
  "trackingLost",
  "recenterRequested",
  "recentered",
] as const;

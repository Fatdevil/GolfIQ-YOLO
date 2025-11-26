import { useEffect, useState } from "react";

import { detectHole, type HoleDetectResponse } from "@/api/holeDetect";

export type AutoHoleSuggestion = {
  hole: number;
  distance_m: number;
  confidence: number;
  reason: string;
};

export type AutoHoleState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "suggested"; suggestion: AutoHoleSuggestion }
  | { status: "error" };

type Options = {
  enabled: boolean;
  courseId?: string;
  lastHole?: number | null;
  lat?: number | null;
  lon?: number | null;
};

export function useAutoHoleSuggest(options: Options): AutoHoleState {
  const { enabled, courseId, lastHole, lat, lon } = options;
  const [state, setState] = useState<AutoHoleState>({ status: "idle" });

  useEffect(() => {
    if (!enabled || !courseId || lat == null || lon == null) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    detectHole({ courseId, lat, lon, lastHole: lastHole ?? undefined })
      .then((res: HoleDetectResponse) => {
        if (cancelled) return;
        setState({
          status: "suggested",
          suggestion: {
            hole: res.hole,
            distance_m: res.distance_m,
            confidence: res.confidence,
            reason: res.reason,
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, courseId, lastHole, lat, lon]);

  return state;
}

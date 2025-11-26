import { useEffect, useState } from "react";

import { fetchCaddieInsights, type CaddieInsights } from "@/api/caddieInsights";
import { fetchSgPreview, type RoundSgPreview } from "@/api/sgPreview";
import { loadAllRoundsFull } from "@/features/quickround/storage";
import { useCaddieMemberId } from "./memberIdentity";
import { buildCoachSuggestions, type CoachSuggestion } from "./coachInsights";

function toTimestamp(value?: string | number): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export type CoachInsightsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; suggestions: CoachSuggestion[] }
  | { status: "empty" }
  | { status: "error" };

export function useCoachInsights(): CoachInsightsState {
  const memberId = useCaddieMemberId();
  const [state, setState] = useState<CoachInsightsState>({ status: "idle" });

  useEffect(() => {
    if (!memberId) {
      setState({ status: "empty" });
      return;
    }

    const rounds = loadAllRoundsFull();
    const sorted = [...rounds].sort(
      (a, b) =>
        toTimestamp(b.completedAt ?? b.startedAt) - toTimestamp(a.completedAt ?? a.startedAt),
    );
    const latestWithRun = sorted.find((r) => Boolean(r.runId));

    if (!latestWithRun) {
      setState({ status: "empty" });
      return;
    }

    setState({ status: "loading" });

    let cancelled = false;
    let sgData: RoundSgPreview | null = null;
    let caddieData: CaddieInsights | null = null;

    Promise.all([
      fetchSgPreview(latestWithRun.runId as string).then((d) => {
        sgData = d;
      }),
      fetchCaddieInsights(memberId).then((d) => {
        caddieData = d;
      }),
    ])
      .then(() => {
        if (cancelled) return;
        const suggestions = buildCoachSuggestions(sgData, caddieData);
        if (suggestions.length === 0) {
          setState({ status: "empty" });
        } else {
          setState({ status: "ready", suggestions });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [memberId]);

  return state;
}

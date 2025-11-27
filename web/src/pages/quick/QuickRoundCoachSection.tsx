import { useMemo } from "react";

import type { RoundSgPreview } from "@/api/sgPreview";
import { UpgradeGate } from "@/access/UpgradeGate";
import { CoachPlanCard } from "@/coach/CoachPlanCard";
import { buildCoachRecommendations } from "@/coach/coachLogic";

type Props = {
  sgStatus: "idle" | "loading" | "loaded" | "error";
  sgPreview: RoundSgPreview | null;
};

export function QuickRoundCoachSection({ sgPreview, sgStatus }: Props) {
  const recommendations = useMemo(() => {
    if (!sgPreview) return [];
    return buildCoachRecommendations({ sgSummary: sgPreview });
  }, [sgPreview]);

  const status: "loading" | "error" | "empty" | "ready" = useMemo(() => {
    if (sgStatus === "loading" || sgStatus === "idle") return "loading";
    if (sgStatus === "error") return "error";
    if (!sgPreview) return "empty";
    return recommendations.length > 0 ? "ready" : "empty";
  }, [sgPreview, sgStatus, recommendations.length]);

  return (
    <UpgradeGate feature="COACH_PLAN">
      <CoachPlanCard status={status} recommendations={recommendations} />
    </UpgradeGate>
  );
}

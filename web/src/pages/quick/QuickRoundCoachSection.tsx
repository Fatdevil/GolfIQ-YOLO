import { useEffect, useState } from "react";

import { fetchCoachRoundSummary, type CoachDiagnosis } from "@/api/coachSummary";
import { UpgradeGate } from "@/access/UpgradeGate";
import { useAccessPlan } from "@/access/UserAccessContext";
import { CoachDiagnosisCard } from "@/coach/CoachDiagnosisCard";

type Props = {
  runId: string | null;
};

export function QuickRoundCoachSection({ runId }: Props) {
  const { isPro, loading: planLoading } = useAccessPlan();
  const [diagnosis, setDiagnosis] = useState<CoachDiagnosis | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "empty" | "ready">("empty");

  useEffect(() => {
    if (planLoading) {
      setStatus("loading");
      return;
    }
    if (!isPro || !runId) {
      setDiagnosis(null);
      setStatus("empty");
      return;
    }

    let cancelled = false;
    setStatus("loading");
    fetchCoachRoundSummary(runId)
      .then((summary) => {
        if (cancelled) return;
        setDiagnosis(summary.diagnosis ?? null);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [isPro, planLoading, runId]);

  if (!runId) return null;

  return (
    <UpgradeGate feature="COACH_PLAN">
      <CoachDiagnosisCard diagnosis={diagnosis} status={status} />
    </UpgradeGate>
  );
}

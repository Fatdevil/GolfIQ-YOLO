import { useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchCoachRoundSummary } from "@/api/coachSummary";
import { UpgradeGate } from "@/access/UpgradeGate";
import { useAccessPlan } from "@/access/UserAccessContext";
import { useNotifications } from "@/notifications/NotificationContext";

interface Props {
  runId: string;
  className?: string;
}

export function ShareWithCoachButton({ runId, className }: Props) {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const { isPro, loading } = useAccessPlan();
  const [busy, setBusy] = useState(false);

  if (!runId || loading) {
    return null;
  }

  const button = (
    <button
      type="button"
      className={`inline-flex items-center rounded-md border border-emerald-500/60 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10 ${className ?? ""}`.trim()}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          const summary = await fetchCoachRoundSummary(runId);
          if (!navigator?.clipboard?.writeText) {
            throw new Error("clipboard_unavailable");
          }
          await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
          notify("success", t("coach.share.copied"));
        } catch (error) {
          notify("error", t("coach.share.error"));
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      aria-busy={busy}
    >
      {busy ? t("access.loading") : t("coach.share.button")}
    </button>
  );

  if (!isPro) {
    return <UpgradeGate feature="COACH_SHARE">{button}</UpgradeGate>;
  }

  return button;
}

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { CoachRecommendation } from "@/coach/coachLogic";

type CoachPlanCardProps = {
  status: "loading" | "error" | "empty" | "ready";
  recommendations: CoachRecommendation[];
};

export function CoachPlanCard({ status, recommendations }: CoachPlanCardProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-50">{t("profile.coach.title")}</h3>
          <p className="text-xs text-slate-400">{t("profile.coach.subtitle")}</p>
        </div>
      </div>

      {status === "loading" && <p className="mt-3 text-xs text-slate-400">{t("profile.coach.loading")}</p>}

      {status === "error" && <p className="mt-3 text-xs text-amber-400">{t("profile.coach.error")}</p>}

      {status === "empty" && <p className="mt-3 text-xs text-slate-400">{t("profile.coach.empty")}</p>}

      {status === "ready" && recommendations.length > 0 && (
        <div className="mt-4 space-y-4 text-sm text-slate-100">
          <ol className="space-y-3">
            {recommendations.map((rec, idx) => (
              <li key={`${rec.focusCategory}-${idx}`} className="space-y-2 rounded-md border border-slate-800 bg-slate-950/40 p-3">
                <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-slate-400">
                  <span className="font-semibold text-emerald-300">{t(`coach.sg.category.${rec.focusCategory}`)}</span>
                  <span>{t("profile.coach.plan.focusLabel")}</span>
                </div>
                <p className="text-sm font-medium text-slate-100">{rec.reason}</p>

                <ul className="space-y-1 text-xs text-slate-200">
                  {rec.rangeMission && (
                    <li>
                      <span className="font-semibold text-emerald-200">Range:</span> {rec.rangeMission.description}
                    </li>
                  )}
                  {rec.onCourseMission && (
                    <li>
                      <span className="font-semibold text-emerald-200">On-course:</span> {rec.onCourseMission.description}
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap gap-3 text-[11px]">
            <Link className="underline text-emerald-300" to="/range/practice">
              {t("profile.coach.cta.range")}
            </Link>
            <Link className="underline text-emerald-300" to="/play">
              {t("profile.coach.cta.quick")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

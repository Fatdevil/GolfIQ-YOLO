import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import type { PlayerProfile } from "@/api/profile";

type Props = {
  profile: PlayerProfile;
};

export function PlayerProfilePanel({ profile }: Props) {
  const navigate = useNavigate();
  const { model, plan } = profile;

  const topStrengths = useMemo(() => model.strengths.slice(0, 3), [model.strengths]);
  const topWeaknesses = useMemo(() => model.weaknesses.slice(0, 3), [model.weaknesses]);

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-emerald-800/60 bg-emerald-900/30 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-emerald-200/80">Player type</p>
            <h3 className="text-xl font-semibold text-emerald-50">{model.playerType}</h3>
            {model.style && <p className="text-xs text-emerald-200/80">Style: {model.style}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm text-emerald-100">
            {typeof model.consistencyScore === "number" && (
              <div>
                <p className="text-xs uppercase tracking-wide text-emerald-200/70">Consistency</p>
                <p className="font-semibold">{model.consistencyScore.toFixed(1)}</p>
              </div>
            )}
            {typeof model.developmentIndex === "number" && (
              <div>
                <p className="text-xs uppercase tracking-wide text-emerald-200/70">Development index</p>
                <p className="font-semibold">{model.developmentIndex.toFixed(1)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
          <h4 className="text-sm font-semibold text-slate-100">Strengths</h4>
          {topStrengths.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No clear strengths yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm text-slate-100">
              {topStrengths.map((item) => (
                <li key={`${item.category}-${item.title}`} className="space-y-1">
                  <p className="font-medium">{item.title}</p>
                  {item.description && <p className="text-xs text-slate-400">{item.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
          <h4 className="text-sm font-semibold text-slate-100">Weaknesses</h4>
          {topWeaknesses.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">No flagged weaknesses. Keep stacking reps.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm text-slate-100">
              {topWeaknesses.map((item) => (
                <li key={`${item.category}-${item.title}`} className="space-y-1">
                  <p className="font-medium">
                    {item.title} <span className="ml-1 text-[11px] uppercase text-amber-300/80">{item.severity}</span>
                  </p>
                  {item.description && <p className="text-xs text-slate-400">{item.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-100">4-week development plan</h4>
        <div className="grid gap-3 md:grid-cols-2">
          {plan.steps.map((step) => (
            <div
              key={step.week}
              className="flex flex-col justify-between rounded-md border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-100 shadow"
            >
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-slate-400">Week {step.week}</p>
                <h5 className="text-base font-semibold">{step.title}</h5>
                <p className="text-xs text-slate-400">{step.description}</p>
              </div>
              {step.suggestedMissions && step.suggestedMissions.length > 0 && (
                <button
                  type="button"
                  className="mt-3 inline-flex w-fit items-center justify-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  onClick={() => navigate(`/range/practice?missionId=${step.suggestedMissions?.[0]}`)}
                >
                  Start mission
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PlayerProfilePanel;

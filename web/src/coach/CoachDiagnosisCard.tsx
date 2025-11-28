import { Link } from "react-router-dom";

import type { CoachDiagnosis } from "@/api/coachSummary";
import { getMissionById } from "@/range/missions";

type Props = {
  diagnosis?: CoachDiagnosis | null;
  status?: "loading" | "error" | "ready" | "empty";
};

const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
const severityTone: Record<string, string> = {
  critical: "text-rose-300 bg-rose-500/10 border-rose-500/40",
  warning: "text-amber-200 bg-amber-500/10 border-amber-500/40",
  info: "text-slate-200 bg-slate-500/10 border-slate-500/30",
};

export function CoachDiagnosisCard({ diagnosis, status = "ready" }: Props) {
  if (status === "loading") {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-200">
        <p className="text-xs text-slate-400">Loading coach diagnosis…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 text-sm text-amber-200">
        <p className="text-xs">Could not load coach diagnosis right now.</p>
      </div>
    );
  }

  const findings = diagnosis?.findings ?? [];
  const sorted = [...findings].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-50">Coach diagnosis</h3>
          <p className="text-xs text-slate-400">Top findings across SG, sequence, and caddie behaviour.</p>
        </div>
      </div>

      {status === "empty" && <p className="mt-3 text-xs text-slate-400">No data for this run yet.</p>}

      {status === "ready" && (
        <div className="mt-4 space-y-3">
          {sorted.length === 0 ? (
            <p className="text-sm text-emerald-200">No major issues detected – keep doing what you’re doing.</p>
          ) : (
            <ul className="space-y-3">
              {sorted.map((finding) => {
                const severityClass = severityTone[finding.severity];
                const missions = finding.suggested_missions ?? [];
                return (
                  <li
                    key={finding.id}
                    className="space-y-2 rounded-md border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-100"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border px-2 py-[2px] text-[11px] font-semibold uppercase tracking-wide ${severityClass}`}
                      >
                        {finding.severity}
                      </span>
                      <span className="text-[11px] uppercase tracking-wide text-slate-400">{finding.category}</span>
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-50">{finding.title}</p>
                      <p className="text-sm text-slate-200">{finding.message}</p>
                    </div>

                    {missions.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-semibold">
                        {missions.map((missionId) => {
                          const mission = getMissionById(missionId as never);
                          const label = mission?.label ?? missionId;
                          return (
                            <Link
                              key={`${finding.id}-${missionId}`}
                              className="rounded border border-emerald-500/40 px-2 py-1 text-emerald-200 hover:bg-emerald-500/10"
                              to={`/range/practice?missionId=${missionId}`}
                            >
                              Start {label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}


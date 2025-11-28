import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import type {
  CoachDiagnosis,
  CoachHoleSg,
  CoachRoundSummary,
  CoachSequenceSummary,
  CoachSgCategory,
} from "@/api/coachSummary";
import { fetchCoachSharePayload } from "@/api/coachShare";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 shadow">
      <h2 className="mb-3 text-lg font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function SgTable({ sgByCategory }: { sgByCategory: CoachSgCategory[] }) {
  if (!sgByCategory.length) return <p className="text-sm text-slate-400">No strokes-gained data.</p>;
  const sorted = [...sgByCategory].sort((a, b) => a.sg - b.sg);
  const worst = sorted[0]?.name;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-slate-400">
          <tr>
            <th className="px-2 py-1">Category</th>
            <th className="px-2 py-1">SG</th>
          </tr>
        </thead>
        <tbody>
          {sgByCategory.map((row) => (
            <tr key={row.name} className="border-t border-slate-800">
              <td className="px-2 py-1 capitalize text-slate-200">{row.name}</td>
              <td className={`px-2 py-1 font-semibold ${row.name === worst ? "text-amber-400" : "text-emerald-200"}`}>
                {row.sg.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SgHolesTable({ sgPerHole }: { sgPerHole: CoachHoleSg[] }) {
  if (!sgPerHole.length) return <p className="text-sm text-slate-400">No hole-level SG available.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-slate-400">
          <tr>
            <th className="px-2 py-1">Hole</th>
            <th className="px-2 py-1">Gross</th>
            <th className="px-2 py-1">SG Total</th>
            <th className="px-2 py-1">Leak</th>
          </tr>
        </thead>
        <tbody>
          {sgPerHole.map((row) => (
            <tr key={row.hole} className="border-t border-slate-800">
              <td className="px-2 py-1 text-slate-200">{row.hole}</td>
              <td className="px-2 py-1 text-slate-200">{row.gross_score}</td>
              <td className="px-2 py-1 font-semibold text-emerald-200">{row.sg_total.toFixed(2)}</td>
              <td className="px-2 py-1 text-slate-300">{row.worst_category ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiagnosisList({ diagnosis }: { diagnosis: CoachDiagnosis | null | undefined }) {
  if (!diagnosis?.findings?.length) {
    return <p className="text-sm text-slate-400">No diagnostics available.</p>;
  }
  return (
    <div className="space-y-3">
      {diagnosis.findings.map((finding) => (
        <div key={finding.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">{finding.title}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                finding.severity === "critical"
                  ? "bg-rose-500/20 text-rose-200"
                  : finding.severity === "warning"
                    ? "bg-amber-500/20 text-amber-200"
                    : "bg-emerald-500/20 text-emerald-200"
              }`}
            >
              {finding.severity}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-200">{finding.message}</p>
        </div>
      ))}
    </div>
  );
}

function SequenceSummary({ sequence }: { sequence: CoachSequenceSummary | null | undefined }) {
  if (!sequence) return <p className="text-sm text-slate-400">No sequence data.</p>;
  return (
    <div className="space-y-2 text-sm text-slate-200">
      <p>
        Max hips {sequence.max_hip_rotation.toFixed(1)}°, shoulders {sequence.max_shoulder_rotation.toFixed(1)}°, X-factor {" "}
        {sequence.max_x_factor.toFixed(1)}°
      </p>
      <p>
        Sequence: {sequence.sequence_order.join(" → ")} {sequence.is_ideal ? "(OK)" : "(off)"}
      </p>
    </div>
  );
}

type LoadState = "idle" | "loading" | "error" | "invalid" | "ready";

export function CoachShareReportPage() {
  const { sid } = useParams<{ sid: string }>();
  const [state, setState] = useState<LoadState>("idle");
  const [summary, setSummary] = useState<CoachRoundSummary | null>(null);

  useEffect(() => {
    if (!sid) {
      setState("invalid");
      return;
    }
    let cancelled = false;
    setState("loading");
    fetchCoachSharePayload(sid)
      .then((payload) => {
        if (cancelled) return;
        if (payload.kind !== "coach_round_summary" || !payload.summary) {
          setState("invalid");
          return;
        }
        setSummary(payload.summary);
        setState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [sid]);

  const sgByCategory = useMemo(() => summary?.sg_by_category ?? [], [summary]);
  const sgPerHole = useMemo(() => summary?.sg_per_hole ?? [], [summary]);

  if (state === "loading" || state === "idle") {
    return <p className="text-slate-200">Loading coach report…</p>;
  }

  if (state === "error") {
    return <p className="text-rose-200">Unable to load this coach share. The link may have expired.</p>;
  }

  if (state === "invalid" || !summary) {
    return <p className="text-amber-200">Invalid coach share link.</p>;
  }

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-slate-800 bg-slate-900/80 p-4 shadow">
        <p className="text-sm uppercase tracking-wide text-slate-400">Coach report</p>
        <h1 className="text-2xl font-bold text-white">{summary.course_name ?? "Round"}</h1>
        <p className="mt-1 text-slate-200">
          {summary.date && <span className="mr-3">{summary.date}</span>}
          {summary.tees && <span className="mr-3">{summary.tees}</span>}
          {summary.score != null && <span>Score {summary.score}</span>}
        </p>
        {summary.sg_total != null && (
          <p className="mt-2 text-lg font-semibold text-emerald-200">Total SG: {summary.sg_total.toFixed(2)}</p>
        )}
      </header>

      <Section title="Strokes-gained overview">
        <SgTable sgByCategory={sgByCategory} />
      </Section>

      <Section title="Hole-by-hole">
        <SgHolesTable sgPerHole={sgPerHole} />
      </Section>

      <Section title="Coach diagnosis">
        <DiagnosisList diagnosis={summary.diagnosis} />
      </Section>

      <Section title="Kinematic sequence">
        <SequenceSummary sequence={summary.sequence} />
      </Section>

      <Section title="Caddie & missions">
        <div className="space-y-2 text-sm text-slate-200">
          {summary.caddie ? (
            <p>
              Trusted club: {summary.caddie.trusted_club ?? "n/a"} ({summary.caddie.trusted_club_trust_score?.toFixed(2) ?? "-"}) · Ignored club: {" "}
              {summary.caddie.ignored_club ?? "n/a"} ({summary.caddie.ignored_club_trust_score?.toFixed(2) ?? "-"})
            </p>
          ) : (
            <p className="text-slate-400">No caddie highlights.</p>
          )}
          {summary.mission ? (
            <p>
              Mission: {summary.mission.mission_label ?? summary.mission.mission_id ?? "n/a"} · {" "}
              {summary.mission.success === true
                ? "Success"
                : summary.mission.success === false
                  ? "Failed"
                  : "In progress"}
            </p>
          ) : (
            <p className="text-slate-400">No missions.</p>
          )}
        </div>
      </Section>
    </div>
  );
}

export default CoachShareReportPage;

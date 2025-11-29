import { useEffect, useMemo, useState } from "react";

import {
  fetchSessionTimeline,
  type SessionTimelineEvent,
  type SessionTimelineResponse,
} from "../api";
import { useAccessPlan } from "@/access/UserAccessContext";
import { UpgradeGate } from "@/access/UpgradeGate";

const TYPE_COLOR: Record<SessionTimelineEvent["type"], string> = {
  swing_start: "bg-emerald-400",
  impact: "bg-orange-400",
  peak_hips: "bg-sky-400",
  peak_shoulders: "bg-indigo-400",
  tempo_marker: "bg-amber-300",
  hole_transition: "bg-fuchsia-400",
  coach_cue: "bg-pink-400",
  mission_event: "bg-emerald-300",
};

interface SwingTimelinePanelProps {
  runId: string;
}

function labelForEvent(event: SessionTimelineEvent): string {
  if (event.label && event.label.trim()) {
    return event.label;
  }
  return event.type.replace("_", " ");
}

export default function SwingTimelinePanel({ runId }: SwingTimelinePanelProps) {
  const { isPro, loading: planLoading } = useAccessPlan();
  const [data, setData] = useState<SessionTimelineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSessionTimeline(runId)
      .then((resp) => {
        if (cancelled) return;
        setData(resp);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || "Failed to load timeline");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [runId]);

  const events = data?.events ?? [];
  const maxTs = useMemo(() => {
    return events.reduce((max, event) => Math.max(max, event.ts), 0);
  }, [events]);

  if (planLoading) {
    return null;
  }

  if (!isPro) {
    return (
      <UpgradeGate feature="SESSION_TIMELINE">
        <div className="rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-200">
          Session timeline is available for Pro members.
        </div>
      </UpgradeGate>
    );
  }

  if (loading) {
    return (
      <div className="rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-200">
        Loading session timeline…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-500/50 bg-red-900/20 px-4 py-3 text-sm text-red-200">
        {error}
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
        No timeline available for this round yet.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
      <div className="text-sm font-semibold text-slate-100">Swing timeline</div>
      <div className="text-xs text-slate-400">Simple timestamped markers for swings, peaks and cues.</div>
      <div className="relative h-16 w-full">
        <div className="absolute left-0 right-0 top-6 h-1 rounded-full bg-slate-800" />
        {events.map((event, idx) => {
          const safeTs = Math.max(event.ts, 0);
          const leftPct = maxTs > 0 ? (safeTs / maxTs) * 100 : 0;
          const clampedLeft = Math.min(100, Math.max(0, leftPct));
          const color = TYPE_COLOR[event.type] ?? "bg-sky-400";
          return (
            <div
              key={`${event.type}-${idx}-${safeTs}`}
              className="absolute flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${clampedLeft}%` }}
            >
              <div className="mb-2 rounded-md bg-slate-800/80 px-2 py-1 text-[11px] text-slate-100 shadow">
                {labelForEvent(event)}
              </div>
              <div className={`h-3 w-[6px] rounded-full ${color}`} />
              <div className="mt-1 text-[10px] font-mono text-slate-400">{safeTs.toFixed(2)}s</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

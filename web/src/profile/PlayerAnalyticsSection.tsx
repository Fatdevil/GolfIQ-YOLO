import { useEffect, useState } from "react";

import { UpgradeGate } from "@/access/UpgradeGate";
import { useAccessPlan } from "@/access/UserAccessContext";
import { fetchPlayerAnalytics, type PlayerAnalytics } from "@/api/analytics";

import { PlayerAnalyticsDashboard } from "./PlayerAnalyticsDashboard";

type LoadState = "idle" | "loading" | "ready" | "error";

export function PlayerAnalyticsSection() {
  const { isPro, loading } = useAccessPlan();
  const [analytics, setAnalytics] = useState<PlayerAnalytics | null>(null);
  const [state, setState] = useState<LoadState>("idle");

  useEffect(() => {
    if (loading || !isPro) {
      setAnalytics(null);
      setState("idle");
      return;
    }

    let cancelled = false;
    setState("loading");

    fetchPlayerAnalytics()
      .then((data) => {
        if (cancelled) return;
        setAnalytics(data);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [isPro, loading]);

  const content = (() => {
    if (loading) return <p className="text-xs text-slate-400">Checking access…</p>;
    if (!isPro)
      return (
        <UpgradeGate feature="PLAYER_ANALYTICS">
          <div className="text-sm text-slate-300 space-y-2">
            <p>Unlock personalised strokes-gained insights, category focus, and mission progress.</p>
            <p className="text-xs text-slate-500">Upgrade to Pro to activate analytics.</p>
          </div>
        </UpgradeGate>
      );

    if (state === "loading") return <p className="text-xs text-slate-400">Loading analytics…</p>;
    if (state === "error")
      return <p className="text-xs text-amber-400">Could not load analytics right now.</p>;
    if (state === "ready" && analytics)
      return <PlayerAnalyticsDashboard analytics={analytics} />;

    return <p className="text-xs text-slate-400">No analytics available yet.</p>;
  })();

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Player analytics</h2>
          <p className="text-xs text-slate-400">Recent SG trends, category focus, and mission progress.</p>
        </div>
      </div>
      {content}
    </section>
  );
}

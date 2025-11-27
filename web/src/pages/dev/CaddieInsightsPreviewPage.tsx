import { useMemo, useState } from "react";

import { UpgradeGate } from "@/access/UpgradeGate";
import { useAccessFeatures } from "@/access/UserAccessContext";
import {
  fetchCaddieInsights,
  type CaddieInsights,
  type ClubInsight,
  type CaddieClubStats,
} from "@/api/caddieInsights";

function formatPercent(value: number | null | undefined): string {
  if (value === null || typeof value === "undefined") return "N/A";
  return `${Math.round(value * 1000) / 10}%`;
}

function formatAcceptRate(accepted: number, total: number): string {
  if (total <= 0) return "—";
  return formatPercent(accepted / total);
}

function normaliseClubInsights(
  clubs: ClubInsight[] | undefined,
  fallback: CaddieClubStats[],
): ClubInsight[] {
  if (clubs && clubs.length > 0) return clubs;
  return fallback.map((club) => ({
    club_id: club.club,
    total_tips: club.shown,
    accepted: club.accepted,
    ignored: Math.max(club.shown - club.accepted, 0),
    recent_accepted: club.accepted,
    recent_total: club.shown,
    trust_score: club.shown > 0 ? club.accepted / club.shown : 0,
  }));
}

export function CaddieInsightsPreviewPage() {
  const { hasPlanFeature } = useAccessFeatures();
  const [memberId, setMemberId] = useState("preview-member");
  const [windowDays, setWindowDays] = useState(30);
  const [insights, setInsights] = useState<CaddieInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clubInsights = useMemo(
    () => (insights ? normaliseClubInsights(insights.clubs, insights.per_club) : []),
    [insights],
  );

  const topTrusted = useMemo(
    () => [...clubInsights].sort((a, b) => b.trust_score - a.trust_score).slice(0, 3),
    [clubInsights],
  );

  const leastTrusted = useMemo(
    () => [...clubInsights].sort((a, b) => a.trust_score - b.trust_score).slice(0, 3),
    [clubInsights],
  );

  const handleLoad = async () => {
    if (!hasPlanFeature("CADDIE_INSIGHTS")) return;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchCaddieInsights(memberId, windowDays);
      setInsights(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load insights";
      setError(message);
      setInsights(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <UpgradeGate feature="CADDIE_INSIGHTS">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Caddie Insights v2</h1>
          <p className="text-sm text-slate-300">
            Load advice telemetry, then review trust trends per club (recent vs lifetime).
          </p>
        </div>

        <div className="grid gap-4 rounded-md border border-slate-800 bg-slate-900 p-4 shadow">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="memberId">
              Member ID
              <input
                id="memberId"
                type="text"
                className="rounded border border-slate-700 bg-slate-800 p-2 text-slate-100"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="windowDays">
              Window
              <select
                id="windowDays"
                className="rounded border border-slate-700 bg-slate-800 p-2 text-slate-100"
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
              >
                {[7, 30, 90].map((value) => (
                  <option key={value} value={value}>
                    Last {value} days
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            className={[
              "inline-flex w-full justify-center rounded bg-emerald-600 px-4 py-2 font-semibold text-white",
              "hover:bg-emerald-500",
              "disabled:cursor-not-allowed disabled:bg-emerald-900",
            ].join(" ")}
            onClick={handleLoad}
            disabled={loading || !memberId.trim() || !hasPlanFeature("CADDIE_INSIGHTS")}
          >
            {loading ? "Loading..." : "Load insights"}
          </button>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="grid gap-4 rounded-md border border-slate-800 bg-slate-950 p-4 shadow">
          <h2 className="text-xl font-semibold">Summary</h2>
          {insights ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded border border-slate-800 bg-slate-900 p-3">
                <p className="text-sm text-slate-400">Advice shown</p>
                <p className="text-2xl font-semibold">{insights.advice_shown}</p>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900 p-3">
                <p className="text-sm text-slate-400">Advice accepted</p>
                <p className="text-2xl font-semibold">{insights.advice_accepted}</p>
              </div>
              <div className="rounded border border-slate-800 bg-slate-900 p-3">
                <p className="text-sm text-slate-400">Accept rate</p>
                <p className="text-2xl font-semibold">{formatPercent(insights.accept_rate)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No insights loaded.</p>
          )}
        </div>

        {clubInsights.length > 0 && (
          <div className="grid gap-4 rounded-md border border-slate-800 bg-slate-950 p-4 shadow">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold">Trust &amp; trends</h2>
              <p className="text-xs text-slate-400">
                Recent window: last {insights?.recent_window_days ?? 7} days
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-emerald-200">Top trusted clubs</h3>
                <div className="space-y-2">
                  {topTrusted.map((club) => (
                    <div
                      key={club.club_id}
                      className="rounded border border-slate-800 bg-slate-900 px-3 py-2"
                    >
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span>{club.club_id}</span>
                        <span className="text-emerald-300">{formatPercent(club.trust_score)}</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Recent {formatAcceptRate(club.recent_accepted, club.recent_total)} • Lifetime{" "}
                        {formatAcceptRate(club.accepted, club.total_tips)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-amber-200">Clubs you often ignore</h3>
                <div className="space-y-2">
                  {leastTrusted.map((club) => (
                    <div
                      key={club.club_id}
                      className="rounded border border-amber-900/60 bg-amber-950/30 px-3 py-2"
                    >
                      <div className="flex items-center justify-between text-sm font-semibold">
                        <span>{club.club_id}</span>
                        <span className="text-amber-300">{formatPercent(club.trust_score)}</span>
                      </div>
                      <p className="text-xs text-amber-100/80">
                        Ignored {club.ignored}x • Recent {formatAcceptRate(club.recent_accepted, club.recent_total)}
                      </p>
                      <p className="text-[11px] text-amber-200/80">
                        Check your bag gapping or preferred strategy for this club.
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 rounded-md border border-slate-800 bg-slate-950 p-4 shadow">
          <h2 className="text-xl font-semibold">Per club</h2>
          {clubInsights.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="px-2 py-1">Club</th>
                    <th className="px-2 py-1">Trust</th>
                    <th className="px-2 py-1">Recent accept</th>
                    <th className="px-2 py-1">Lifetime accept</th>
                    <th className="px-2 py-1">Ignored</th>
                  </tr>
                </thead>
                <tbody>
                  {clubInsights.map((row) => (
                    <tr key={row.club_id} className="border-b border-slate-900">
                      <td className="px-2 py-1 font-medium">{row.club_id}</td>
                      <td className="px-2 py-1">{formatPercent(row.trust_score)}</td>
                      <td className="px-2 py-1">
                        {formatAcceptRate(row.recent_accepted, row.recent_total)}
                        <span className="text-[11px] text-slate-500"> ({row.recent_total} tips)</span>
                      </td>
                      <td className="px-2 py-1">
                        {formatAcceptRate(row.accepted, row.total_tips)}
                        <span className="text-[11px] text-slate-500"> ({row.total_tips} tips)</span>
                      </td>
                      <td className="px-2 py-1">{row.ignored}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No per-club data.</p>
          )}
        </div>
      </div>
    </UpgradeGate>
  );
}

export default CaddieInsightsPreviewPage;

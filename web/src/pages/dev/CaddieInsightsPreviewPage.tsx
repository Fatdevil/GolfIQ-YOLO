import { useState } from "react";

import { fetchCaddieInsights, type CaddieInsights } from "@/api";

function formatPercent(value: number | null): string {
  if (value === null) return "N/A";
  return `${Math.round(value * 1000) / 10}%`;
}

export function CaddieInsightsPreviewPage() {
  const [memberId, setMemberId] = useState("preview-member");
  const [windowDays, setWindowDays] = useState(30);
  const [insights, setInsights] = useState<CaddieInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async () => {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Caddie Insights Preview</h1>
        <p className="text-sm text-slate-300">
          Enter a member ID and load aggregated advice telemetry for a recent window.
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
          disabled={loading || !memberId.trim()}
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

      <div className="grid gap-4 rounded-md border border-slate-800 bg-slate-950 p-4 shadow">
        <h2 className="text-xl font-semibold">Per club</h2>
        {insights && insights.per_club.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-1">Club</th>
                  <th className="px-2 py-1">Shown</th>
                  <th className="px-2 py-1">Accepted</th>
                  <th className="px-2 py-1">Accept %</th>
                </tr>
              </thead>
              <tbody>
                {insights.per_club.map((row) => {
                  const rate = row.shown > 0 ? row.accepted / row.shown : null;
                  return (
                    <tr key={row.club} className="border-b border-slate-900">
                      <td className="px-2 py-1 font-medium">{row.club}</td>
                      <td className="px-2 py-1">{row.shown}</td>
                      <td className="px-2 py-1">{row.accepted}</td>
                      <td className="px-2 py-1">{formatPercent(rate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No per-club data.</p>
        )}
      </div>
    </div>
  );
}

export default CaddieInsightsPreviewPage;

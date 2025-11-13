import React from "react";
import { postMockAnalyze } from "../api";
import { RangeImpactCard } from "../range/RangeImpactCard";
import { computeRangeSummary } from "../range/stats";
import { RangeShot, RangeShotMetrics } from "../range/types";

const MOCK_ANALYZE_BODY = Object.freeze({
  frames: 8,
  fps: 120.0,
  persist: false,
});

type AnalyzeMetrics = {
  ball_speed_mps?: number | null;
  ball_speed_mph?: number | null;
  carry_m?: number | null;
  launch_deg?: number | null;
  side_angle_deg?: number | null;
  quality?: string | null;
  impact_quality?: string | null;
};

type AnalyzeResponse = {
  metrics?: AnalyzeMetrics | null;
};

function normalizeQuality(value: string | null | undefined): "good" | "medium" | "poor" {
  if (value === "good" || value === "medium" || value === "poor") {
    return value;
  }
  return "medium";
}

function mapMetrics(metrics: AnalyzeMetrics | null | undefined): RangeShotMetrics {
  if (!metrics) {
    return {
      ballSpeedMps: null,
      ballSpeedMph: null,
      carryM: null,
      launchDeg: null,
      sideAngleDeg: null,
      quality: "medium",
    };
  }

  const ballSpeedMps =
    typeof metrics.ball_speed_mps === "number" ? metrics.ball_speed_mps : null;
  const ballSpeedMph =
    typeof metrics.ball_speed_mph === "number"
      ? metrics.ball_speed_mph
      : ballSpeedMps != null
        ? ballSpeedMps * 2.23694
        : null;

  return {
    ballSpeedMps,
    ballSpeedMph,
    carryM: typeof metrics.carry_m === "number" ? metrics.carry_m : null,
    launchDeg: typeof metrics.launch_deg === "number" ? metrics.launch_deg : null,
    sideAngleDeg:
      typeof metrics.side_angle_deg === "number" ? metrics.side_angle_deg : null,
    quality: normalizeQuality(metrics.quality ?? metrics.impact_quality ?? null),
  };
}

export default function RangePracticePage() {
  const [club, setClub] = React.useState("7i");
  const [shots, setShots] = React.useState<RangeShot[]>([]);
  const [latest, setLatest] = React.useState<RangeShotMetrics | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const summary = computeRangeSummary(shots);

  async function handleHit() {
    setLoading(true);
    setError(null);
    try {
      const response = (await postMockAnalyze({ ...MOCK_ANALYZE_BODY })) as AnalyzeResponse;
      const metrics = mapMetrics(response.metrics);
      const timestamp = Date.now();
      setShots((prev) => {
        const shot: RangeShot = {
          id: `${timestamp}-${prev.length + 1}`,
          ts: timestamp,
          club,
          metrics,
        };
        return [...prev, shot];
      });
      setLatest(metrics);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to analyze shot";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Range Practice (beta)</h1>

      <div className="flex gap-2 items-center">
        <label className="text-sm">
          Club:
          <select
            value={club}
            onChange={(event) => setClub(event.target.value)}
            className="ml-2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          >
            <option value="D">Driver</option>
            <option value="3w">3W</option>
            <option value="5w">5W</option>
            <option value="7i">7i</option>
            <option value="9i">9i</option>
            <option value="PW">PW</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => {
            void handleHit();
          }}
          disabled={loading}
          className="ml-auto px-4 py-2 rounded bg-emerald-600 text-white text-sm disabled:opacity-60"
        >
          {loading ? "Analyzing…" : "Hit & analyze"}
        </button>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      <RangeImpactCard metrics={latest} />

      <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
        <div className="font-semibold mb-1">Session summary</div>
        <div>Shots: {summary.shots}</div>
        <div>
          Avg ball speed: {summary.avgBallSpeedMps != null ? `${(summary.avgBallSpeedMps * 3.6).toFixed(1)} km/h` : "—"}
        </div>
        <div>
          Avg carry: {summary.avgCarryM != null ? `${summary.avgCarryM.toFixed(1)} m` : "—"}
        </div>
        <div>
          Side dispersion (σ): {summary.dispersionSideDeg != null ? `${summary.dispersionSideDeg.toFixed(1)}°` : "—"}
        </div>
      </div>

      <div className="max-h-48 overflow-auto rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
        <div className="font-semibold mb-1">Shot log</div>
        {shots.length === 0 ? (
          <div className="text-slate-500">No shots yet.</div>
        ) : (
          <ul className="space-y-1">
            {shots
              .slice()
              .reverse()
              .map((shot) => (
                <li key={shot.id} className="flex justify-between">
                  <span>
                    {shot.club} • {shot.metrics.ballSpeedMph != null ? `${shot.metrics.ballSpeedMph.toFixed(1)} mph` : "—"}
                  </span>
                  <span className="text-slate-500">
                    {shot.metrics.carryM != null ? `${shot.metrics.carryM.toFixed(0)} m` : "—"}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

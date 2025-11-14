import React from "react";
import { postMockAnalyze } from "../api";
import { RangeImpactCard } from "../range/RangeImpactCard";
import { computeRangeSummary } from "../range/stats";
import { RangeShot, RangeShotMetrics } from "../range/types";
import { computeGappingStats, recommendedCarry } from "@web/bag/gapping";
import { loadBag, updateClubCarry } from "@web/bag/storage";
import type { BagState } from "@web/bag/types";
import {
  TargetBingoConfig,
  buildRangeShareSummary,
  buildSprayBins,
  scoreTargetBingo,
} from "../features/range/games";
import { SprayHeatmap } from "../features/range/SprayHeatmap";

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

type RangeMode = "practice" | "target-bingo" | "gapping";

export default function RangePracticePage() {
  const [bag] = React.useState<BagState>(() => loadBag());
  const [currentClubId, setCurrentClubId] = React.useState<string>(
    () => bag.clubs[0]?.id ?? "7i"
  );
  const [shots, setShots] = React.useState<RangeShot[]>([]);
  const [latest, setLatest] = React.useState<RangeShotMetrics | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<RangeMode>("practice");
  const [bingoCfg, setBingoCfg] = React.useState<TargetBingoConfig>({
    target_m: 150,
    tolerance_m: 7,
    maxShots: 20,
  });
  const [copyStatus, setCopyStatus] = React.useState<string | null>(null);

  const summary = React.useMemo(() => computeRangeSummary(shots), [shots]);
  const bingoResult = React.useMemo(
    () => (mode === "target-bingo" ? scoreTargetBingo(shots, bingoCfg) : null),
    [mode, shots, bingoCfg]
  );
  const sprayBins = React.useMemo(() => buildSprayBins(shots, 10), [shots]);

  React.useEffect(() => {
    if (!copyStatus) {
      return;
    }
    const id = window.setTimeout(() => setCopyStatus(null), 3000);
    return () => window.clearTimeout(id);
  }, [copyStatus]);

  async function handleHit() {
    setLoading(true);
    setError(null);
    try {
      const response = (await postMockAnalyze({ ...MOCK_ANALYZE_BODY })) as AnalyzeResponse;
      const metrics = mapMetrics(response.metrics);
      const timestamp = Date.now();
      const clubEntry = bag.clubs.find((item) => item.id === currentClubId);
      const clubLabel = clubEntry?.label ?? currentClubId;
      setShots((prev) => {
        const shot: RangeShot = {
          id: `${timestamp}-${prev.length + 1}`,
          ts: timestamp,
          club: clubLabel,
          clubId: currentClubId,
          clubLabel,
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

  async function handleCopySummary() {
    const summaryPayload = buildRangeShareSummary({
      mode,
      bingoConfig: bingoCfg,
      shots,
      bingoResult,
      sessionSummary: summary,
    });
    const text = JSON.stringify(summaryPayload, null, 2);

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        setCopyStatus("Sammanfattning kopierad");
      } else {
        setCopyStatus("Clipboard saknas i denna miljö");
      }
    } catch (err) {
      console.error("Failed to copy range summary", err);
      setCopyStatus("Kunde inte kopiera");
    }
  }

  const bingoShots = bingoResult?.shots.slice(-5) ?? [];

  const clubOptions = bag.clubs;
  const currentClub = React.useMemo(
    () => clubOptions.find((club) => club.id === currentClubId),
    [clubOptions, currentClubId]
  );

  const gappingShots = React.useMemo(
    () => shots.filter((shot) => (shot.clubId ?? shot.club) === currentClubId),
    [shots, currentClubId]
  );
  const gappingStats = React.useMemo(
    () => (mode === "gapping" ? computeGappingStats(gappingShots) : null),
    [mode, gappingShots]
  );
  const suggestedCarry = React.useMemo(
    () => (mode === "gapping" ? recommendedCarry(gappingStats) : null),
    [mode, gappingStats]
  );

  function handleSaveSuggestedCarry() {
    if (suggestedCarry == null) {
      return;
    }
    const latestBag = loadBag();
    updateClubCarry(latestBag, currentClubId, suggestedCarry);
    setCopyStatus("Bag uppdaterad");
  }

  function formatErrorText(value: number) {
    const rounded = Math.abs(value).toFixed(1);
    if (Math.abs(value) < 0.05) {
      return "0 m";
    }
    return value > 0 ? `+${rounded} m lång` : `−${rounded} m kort`;
  }

  return (
    <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Range Practice (beta)</h1>

      <div className="flex gap-2 items-center">
        <label className="text-sm">
          Club:
          <select
            value={currentClubId}
            onChange={(event) => setCurrentClubId(event.target.value)}
            className="ml-2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          >
            {clubOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} ({option.id})
              </option>
            ))}
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

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex rounded-lg border border-slate-800 bg-slate-900/60 p-1">
          <button
            type="button"
            onClick={() => setMode("practice")}
            className={`px-3 py-1 rounded-md ${
              mode === "practice"
                ? "bg-emerald-600 text-white"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Fri träning
          </button>
          <button
            type="button"
            onClick={() => setMode("target-bingo")}
            className={`px-3 py-1 rounded-md ${
              mode === "target-bingo"
                ? "bg-emerald-600 text-white"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Target Bingo
          </button>
          <button
            type="button"
            onClick={() => setMode("gapping")}
            className={`px-3 py-1 rounded-md ${
              mode === "gapping"
                ? "bg-emerald-600 text-white"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Gapping
          </button>
        </div>

      <button
        type="button"
        onClick={() => {
            void handleCopySummary();
          }}
          className="ml-auto px-3 py-1.5 rounded-md border border-emerald-600 text-emerald-400 hover:bg-emerald-600/10"
        >
          Kopiera sammanfattning
        </button>
      </div>

      {copyStatus && <div className="text-xs text-emerald-400">{copyStatus}</div>}

      {mode === "target-bingo" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">Mål (m)</span>
            <input
              type="number"
              min={50}
              max={250}
              value={bingoCfg.target_m}
              onChange={(event) =>
                setBingoCfg((prev) => ({ ...prev, target_m: Number(event.target.value) }))
              }
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">Tolerans (± m)</span>
            <input
              type="number"
              min={3}
              max={20}
              value={bingoCfg.tolerance_m}
              onChange={(event) =>
                setBingoCfg((prev) => ({ ...prev, tolerance_m: Number(event.target.value) }))
              }
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-300">Senaste skott</span>
            <input
              type="number"
              min={5}
              max={50}
              value={bingoCfg.maxShots}
              onChange={(event) =>
                setBingoCfg((prev) => ({ ...prev, maxShots: Number(event.target.value) }))
              }
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
            />
          </label>
        </div>
      )}

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

      {mode === "gapping" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">Gapping</span>
            {currentClub && (
              <span className="text-slate-400 text-[11px]">
                Klubb: {currentClub.label} ({currentClub.id})
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <label className="text-[11px] text-slate-300">
                Klubb
                <select
                  value={currentClubId}
                  onChange={(event) => setCurrentClubId(event.target.value)}
                  className="ml-2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                >
                  {clubOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} ({option.id})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>Antal slag: {gappingStats?.samples ?? 0}</div>
            <div>
              Snitt carry: {gappingStats?.meanCarry_m != null ? `${gappingStats.meanCarry_m.toFixed(1)} m` : "—"}
            </div>
            <div>
              Median (p50): {gappingStats?.p50_m != null ? `${gappingStats.p50_m.toFixed(1)} m` : "—"}
            </div>
            <div>
              Spridning (std): {gappingStats?.std_m != null ? `${gappingStats.std_m.toFixed(1)} m` : "—"}
            </div>
          </div>

          {suggestedCarry != null && currentClub && (
            <div className="rounded border border-emerald-700 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              Föreslagen carry för {currentClub.label}: {suggestedCarry.toFixed(1)} m
            </div>
          )}

          {suggestedCarry != null && (
            <button
              type="button"
              onClick={handleSaveSuggestedCarry}
              className="rounded-md border border-emerald-600 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/10"
            >
              Spara i Min bag
            </button>
          )}
        </div>
      )}

      {mode === "target-bingo" && bingoResult && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">Target Bingo</h2>
            <span className="text-slate-400 text-[10px]">
              Målet: {bingoCfg.target_m} m ± {bingoCfg.tolerance_m} m
            </span>
          </div>
          {bingoResult.totalShots === 0 ? (
            <div className="text-slate-500">Inga giltiga skott ännu.</div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-slate-400">Träffar</div>
                <div className="text-lg font-semibold text-emerald-400">
                  {bingoResult.hits} / {bingoResult.totalShots}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Träffprocent</div>
                <div className="text-lg font-semibold text-slate-100">
                  {bingoResult.hitRate_pct.toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-slate-400">Genomsnittligt fel</div>
                <div className="text-lg font-semibold text-slate-100">
                  {bingoResult.avgAbsError_m != null
                    ? `${bingoResult.avgAbsError_m.toFixed(1)} m`
                    : "—"}
                </div>
              </div>
            </div>
          )}
          {bingoResult.totalShots > 0 && (
            <div className="space-y-1">
              <div className="text-slate-400">Senaste skotten</div>
              <ul className="space-y-1">
                {bingoShots.map((result) => (
                  <li key={result.shot.id} className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        result.isHit ? "bg-emerald-400" : "bg-red-500"
                      }`}
                    />
                    <span className="text-slate-200">
                      #{result.index}
                    </span>
                    <span className="text-slate-400">
                      {formatErrorText(result.carryError_m)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {mode === "target-bingo" && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
          <h2 className="text-sm font-semibold text-slate-100 mb-2">Träffbild</h2>
          <SprayHeatmap bins={sprayBins} />
        </div>
      )}

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
                    {(shot.clubLabel ?? shot.club) ?? "—"} •
                    {" "}
                    {shot.metrics.ballSpeedMph != null ? `${shot.metrics.ballSpeedMph.toFixed(1)} mph` : "—"}
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

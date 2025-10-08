import { useEffect, useMemo, useRef } from "react";
import {
  computePlaysLike,
  mergePlaysLikeCfg,
  type PlaysLikeCfg,
  type PlaysLikeOptions,
} from "@shared/playslike/PlaysLikeService";
import { postTelemetryEvent } from "../api";

interface PlaysLikePanelProps {
  enabled: boolean;
  distanceMeters?: number | null;
  deltaHMeters?: number | null;
  windParallel?: number | null;
  options?: PlaysLikeOptions;
  cfg?: Partial<PlaysLikeCfg>;
}

const formatDelta = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)} m`;

const qualityStyles: Record<string, string> = {
  good: "bg-emerald-500/90 text-emerald-950",
  warn: "bg-amber-400/90 text-amber-950",
  low: "bg-rose-500/90 text-rose-50",
};

export default function PlaysLikePanel({
  enabled,
  distanceMeters,
  deltaHMeters,
  windParallel,
  options,
  cfg,
}: PlaysLikePanelProps) {
  const resolvedCfg = useMemo(() => {
    const overrides: Partial<PlaysLikeCfg> = {};
    if (options?.kS !== undefined) {
      overrides.slopeFactor = options.kS;
    }
    if (options?.config) {
      Object.assign(overrides, options.config);
    }
    return mergePlaysLikeCfg({ ...(cfg ?? {}), ...overrides });
  }, [cfg, options]);

  const inputs = useMemo(() => {
    if (!enabled) return null;
    if (
      distanceMeters === undefined ||
      distanceMeters === null ||
      !Number.isFinite(distanceMeters) ||
      distanceMeters <= 0
    ) {
      return null;
    }
    const delta = Number.isFinite(deltaHMeters ?? NaN) ? (deltaHMeters as number) : 0;
    const wind = Number.isFinite(windParallel ?? NaN) ? (windParallel as number) : 0;
    return { distance: distanceMeters, delta, wind };
  }, [enabled, distanceMeters, deltaHMeters, windParallel]);

  const result = useMemo(() => {
    if (!inputs) return null;
    return computePlaysLike(inputs.distance, inputs.delta, inputs.wind, resolvedCfg);
  }, [inputs, resolvedCfg]);

  const lastSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !inputs || !result) return;
    const signature = [
      inputs.distance,
      inputs.delta,
      inputs.wind,
      resolvedCfg.windModel,
      resolvedCfg.alphaHead_per_mph,
      resolvedCfg.alphaTail_per_mph,
      resolvedCfg.slopeFactor,
      resolvedCfg.windCap_pctOfD,
      resolvedCfg.taperStart_mph,
    ]
      .map((value) =>
        typeof value === "number" ? value.toFixed(3) : String(value ?? "null"),
      )
      .join("|");
    if (lastSignatureRef.current === signature) {
      return;
    }
    lastSignatureRef.current = signature;
    postTelemetryEvent({
      event: "plays_like_eval",
      D: inputs.distance,
      deltaH: inputs.delta,
      wParallel_mps: inputs.wind,
      model: resolvedCfg.windModel,
      params: {
        alphaHead_per_mph: resolvedCfg.alphaHead_per_mph,
        alphaTail_per_mph: resolvedCfg.alphaTail_per_mph,
        slopeFactor: resolvedCfg.slopeFactor,
        windCap_pctOfD: resolvedCfg.windCap_pctOfD,
        taperStart_mph: resolvedCfg.taperStart_mph,
      },
      eff: result.distanceEff,
      slopeM: result.components.slopeM,
      windM: result.components.windM,
      quality: result.quality,
    }).catch((error) => {
      console.warn("Failed to emit plays_like_eval telemetry", error);
    });
  }, [enabled, inputs, result, resolvedCfg]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-800/80 bg-slate-900/80 p-4 shadow-inner">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">Plays-like distance</p>
          {result ? (
            <p className="text-xs text-slate-400">
              Plays-like {result.distanceEff.toFixed(1)} m (Δ {formatDelta(
                result.components.slopeM + result.components.windM
              )})
            </p>
          ) : (
            <p className="text-xs text-slate-500">Not enough data to compute adjustments.</p>
          )}
        </div>
        {result ? (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              qualityStyles[result.quality] ?? "bg-slate-600 text-slate-100"
            }`}
          >
            {result.quality}
          </span>
        ) : null}
      </div>
      {result ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-200">
          <span className="rounded-full bg-slate-700/70 px-3 py-1">
            slope {formatDelta(result.components.slopeM)}
          </span>
          <span className="rounded-full bg-slate-700/70 px-3 py-1">
            wind {formatDelta(result.components.windM)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

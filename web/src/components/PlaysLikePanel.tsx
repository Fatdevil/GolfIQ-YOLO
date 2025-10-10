import { useEffect, useMemo, useRef, useState } from "react";
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
  temperatureC?: number | null;
  altitudeAsl_m?: number | null;
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
  temperatureC,
  altitudeAsl_m,
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
    const temperature = Number.isFinite(temperatureC ?? NaN)
      ? (temperatureC as number)
      : undefined;
    const altitude = Number.isFinite(altitudeAsl_m ?? NaN)
      ? (altitudeAsl_m as number)
      : undefined;
    return { distance: distanceMeters, delta, wind, temperature, altitude };
  }, [
    enabled,
    distanceMeters,
    deltaHMeters,
    windParallel,
    temperatureC,
    altitudeAsl_m,
  ]);

  const result = useMemo(() => {
    if (!inputs) return null;
    return computePlaysLike(inputs.distance, inputs.delta, inputs.wind, {
      cfg: resolvedCfg,
      temperatureC: inputs.temperature ?? null,
      altitudeAsl_m: inputs.altitude ?? null,
    });
  }, [inputs, resolvedCfg]);

  const lastSignatureRef = useRef<string | null>(null);
  const [qaOpen, setQaOpen] = useState(false);
  const qaOpenedAtRef = useRef<number | null>(null);

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
      resolvedCfg.temperatureEnabled ? inputs.temperature ?? "" : "",
      resolvedCfg.altitudeEnabled ? inputs.altitude ?? "" : "",
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
      T_C: inputs.temperature ?? null,
      h_asl_m: inputs.altitude ?? null,
      deltaTempM: result.components.tempM,
      deltaAltM: result.components.altM,
      quality: result.quality,
    }).catch((error) => {
      console.warn("Failed to emit plays_like_eval telemetry", error);
    });
  }, [enabled, inputs, result, resolvedCfg]);

  useEffect(() => {
    if (!enabled) {
      setQaOpen(false);
      qaOpenedAtRef.current = null;
    }
  }, [enabled]);

  const qaValues = useMemo(() => {
    if (!inputs || !result) return null;
    return {
      distance: inputs.distance,
      delta: inputs.delta,
      wind: inputs.wind,
      kS: resolvedCfg.slopeFactor,
      alphaHead: resolvedCfg.alphaHead_per_mph,
      alphaTail: resolvedCfg.alphaTail_per_mph,
      eff: result.distanceEff,
      quality: result.quality,
      temperatureEnabled: resolvedCfg.temperatureEnabled,
      temperature: inputs.temperature ?? null,
      deltaTempM: result.components.tempM,
      altitudeEnabled: resolvedCfg.altitudeEnabled,
      altitude: inputs.altitude ?? null,
      deltaAltM: result.components.altM,
    };
  }, [inputs, resolvedCfg, result]);

  const toggleQa = () => {
    if (!enabled) return;
    if (qaOpen) {
      const openedAt = qaOpenedAtRef.current;
      const duration = openedAt ? Math.max(0, Date.now() - openedAt) : 0;
      postTelemetryEvent({
        event: "plays_like_ui",
        action: "drawer_close",
        dt_ms: duration,
      }).catch((error) => {
        console.warn("Failed to emit plays_like_ui telemetry", error);
      });
      setQaOpen(false);
      qaOpenedAtRef.current = null;
    } else {
      qaOpenedAtRef.current = Date.now();
      postTelemetryEvent({
        event: "plays_like_ui",
        action: "drawer_open",
        dt_ms: 0,
      }).catch((error) => {
        console.warn("Failed to emit plays_like_ui telemetry", error);
      });
      setQaOpen(true);
    }
  };

  if (!enabled) {
    return null;
  }

  const deltaDisplay = result && inputs ? result.distanceEff - inputs.distance : 0;

  return (
    <div className="rounded-lg border border-slate-800/80 bg-slate-900/80 p-4 shadow-inner">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">Plays-like distance</p>
          {result ? (
            <p className="text-xs text-slate-400">
              Plays-like {result.distanceEff.toFixed(1)} m (Δ {formatDelta(deltaDisplay)})
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
      <div className="mt-4">
        <button
          type="button"
          onClick={toggleQa}
          className="text-xs font-semibold text-sky-300 transition hover:text-sky-200"
        >
          {qaOpen ? "Hide" : "Show"} QA inputs
        </button>
        {qaOpen && (
          <div className="mt-2 rounded-md border border-slate-700/70 bg-slate-900/80 p-3 text-xs text-slate-200">
            {qaValues ? (
              <dl className="space-y-1">
                <div className="flex justify-between">
                  <dt>D</dt>
                  <dd>{qaValues.distance.toFixed(1)} m</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Δh</dt>
                  <dd>{qaValues.delta >= 0 ? "+" : ""}{qaValues.delta.toFixed(1)} m</dd>
                </div>
                <div className="flex justify-between">
                  <dt>W∥</dt>
                  <dd>{qaValues.wind >= 0 ? "+" : ""}{qaValues.wind.toFixed(1)} m/s</dd>
                </div>
                <div className="flex justify-between">
                  <dt>kS</dt>
                  <dd>{qaValues.kS.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>α_head</dt>
                  <dd>{qaValues.alphaHead.toFixed(3)} /mph</dd>
                </div>
                <div className="flex justify-between">
                  <dt>α_tail</dt>
                  <dd>{qaValues.alphaTail.toFixed(3)} /mph</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Eff</dt>
                  <dd>{qaValues.eff.toFixed(1)} m</dd>
                </div>
                {qaValues.temperatureEnabled ? (
                  <div className="flex justify-between">
                    <dt>Temp</dt>
                    <dd>
                      {qaValues.temperature !== null && qaValues.temperature !== undefined
                        ? `${qaValues.temperature.toFixed(1)} °C | Δ ${formatDelta(qaValues.deltaTempM)}`
                        : "—"}
                    </dd>
                  </div>
                ) : null}
                {qaValues.altitudeEnabled ? (
                  <div className="flex justify-between">
                    <dt>Alt</dt>
                    <dd>
                      {qaValues.altitude !== null && qaValues.altitude !== undefined
                        ? `${qaValues.altitude.toFixed(0)} m | Δ ${formatDelta(qaValues.deltaAltM)}`
                        : "—"}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt>Quality</dt>
                  <dd>{qaValues.quality.toUpperCase()}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-slate-400">Not enough data.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

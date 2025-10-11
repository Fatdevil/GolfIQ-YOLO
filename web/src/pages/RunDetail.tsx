import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getRemoteConfig, getRun, postTelemetryEvent } from "../api";
import TracerCanvas from "../components/TracerCanvas";
import GhostFrames from "../components/GhostFrames";
import ExportPanel from "../components/ExportPanel";
import type { MetricOverlay } from "../lib/exportUtils";
import { extractBackViewPayload, mphFromMps, yardsFromMeters } from "../lib/traceUtils";
import { visualTracerEnabled, playsLikeEnabled } from "../config";
import PlaysLikePanel from "../components/PlaysLikePanel";
import { mergePlaysLikeCfg, type PlaysLikeCfg } from "@shared/playslike/PlaysLikeService";
import type { TempAltOverrides } from "@shared/playslike";

interface RunDetailData {
  run_id?: string;
  impact_preview?: string | null;
  [key: string]: unknown;
}

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RunDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [playsLikeCfg, setPlaysLikeCfg] = useState<PlaysLikeCfg>(() => mergePlaysLikeCfg());
  const [rcPlaysLikeEnabled, setRcPlaysLikeEnabled] = useState(false);
  const [playsLikeVariant, setPlaysLikeVariant] = useState<"off" | "v1">("off");
  const [tempAltSettings, setTempAltSettings] = useState<TempAltOverrides | null>(null);
  const lastPlaysLikeTier = useRef<string | null>(null);
  const lastAssignSignature = useRef<string | null>(null);

  const backView = useMemo(() => extractBackViewPayload(data), [data]);
  const qualityBadges = useMemo(() => {
    const badges: Array<{ key: string; value?: string }> = [];
    if (!backView?.quality) {
      return badges;
    }
    Object.entries(backView.quality).forEach(([key, value]) => {
      badges.push({ key, value: value ?? undefined });
    });
    return badges;
  }, [backView]);
  const headerSource = useMemo(() => {
    if (!data || typeof data !== "object") return null;
    const record = data as Record<string, unknown>;
    const headers = record.headers as Record<string, unknown> | undefined;
    if (headers) {
      const raw =
        headers["x-cv-source"] ??
        headers["X-CV-Source"] ??
        headers["x_cv_source"] ??
        headers["cv_source"];
      if (typeof raw === "string") {
        return raw;
      }
    }
    const meta =
      record["cv_source"] ??
      record["source"] ??
      (record["metadata"] as Record<string, unknown> | undefined)?.cv_source;
    return typeof meta === "string" ? meta : null;
  }, [data]);
  const pipelineSource = backView?.source ?? null;

  const metricSources = useMemo(() => {
    if (!data) return [] as Record<string, unknown>[];
    const sources: Record<string, unknown>[] = [];
    const pushIfRecord = (value: unknown) => {
      if (value && typeof value === "object") {
        sources.push(value as Record<string, unknown>);
      }
    };

    const root = data as Record<string, unknown>;
    pushIfRecord(root);
    pushIfRecord(root["metrics"]);
    const analysis = root["analysis"];
    if (analysis && typeof analysis === "object") {
      const analysisRecord = analysis as Record<string, unknown>;
      pushIfRecord(analysisRecord["metrics"]);
    }
    pushIfRecord(root["telemetry"]);
    const payload = root["payload"];
    if (payload && typeof payload === "object") {
      const payloadRecord = payload as Record<string, unknown>;
      pushIfRecord(payloadRecord["metrics"]);
    }
    return sources;
  }, [data]);

  const selectString = useCallback(
    (keys: string[]): string | undefined => {
      for (const source of metricSources) {
        for (const key of keys) {
          const value = source[key];
          if (typeof value === "string" && value.trim()) {
            return value;
          }
        }
      }
      return undefined;
    },
    [metricSources],
  );

  const selectMetric = useCallback(
    (keys: string[]): number | undefined => {
      const pickNumber = (value: unknown): number | undefined => {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string") {
          const parsed = Number.parseFloat(value);
          if (Number.isFinite(parsed)) return parsed;
        }
        return undefined;
      };
      for (const source of metricSources) {
        for (const key of keys) {
          if (source[key] !== undefined) {
            const value = pickNumber(source[key]);
            if (value !== undefined) {
              return value;
            }
          }
        }
      }
      return undefined;
    },
    [metricSources]
  );

  const remoteTier = selectString([
    "tier",
    "deviceTier",
    "configTier",
    "playsLikeTier",
  ]);

  const metricOverlays = useMemo<MetricOverlay[]>(() => {
    if (!data) return [];

    const ballSpeedMps = selectMetric(["ballSpeedMps", "ball_speed_mps", "ballSpeed", "ball_speed"]);
    const clubSpeedMps = selectMetric(["clubSpeedMps", "club_speed_mps", "clubSpeed", "club_speed"]);
    const carryMeters = selectMetric(["carry", "carry_m", "carryMeters", "carry_meters"]);
    const sideAngle = selectMetric(["sideAngle", "side_angle", "side", "sideDeg", "side_deg"]);
    const vertLaunch = selectMetric(["vertLaunch", "launchAngle", "vert_launch", "launch_deg", "launchAngleDeg"]);

    const overlays: MetricOverlay[] = [];

    if (ballSpeedMps !== undefined) {
      const mph = mphFromMps(ballSpeedMps);
      overlays.push({
        label: "Ball Speed",
        value: `${ballSpeedMps.toFixed(2)} m/s`,
        secondary: mph !== undefined ? `${mph.toFixed(1)} mph` : undefined,
      });
    }

    if (clubSpeedMps !== undefined) {
      const mph = mphFromMps(clubSpeedMps);
      overlays.push({
        label: "Club Speed",
        value: `${clubSpeedMps.toFixed(2)} m/s`,
        secondary: mph !== undefined ? `${mph.toFixed(1)} mph` : undefined,
      });
    }

    if (carryMeters !== undefined) {
      const yards = yardsFromMeters(carryMeters);
      overlays.push({
        label: "Carry",
        value: `${carryMeters.toFixed(2)} m`,
        secondary: yards !== undefined ? `${yards.toFixed(1)} yd` : undefined,
      });
    }

    if (sideAngle !== undefined) {
      overlays.push({
        label: "Side Angle",
        value: `${sideAngle.toFixed(2)}°`,
      });
    }

    if (vertLaunch !== undefined) {
      overlays.push({
        label: "Launch",
        value: `${vertLaunch.toFixed(2)}°`,
      });
    }

    return overlays;
  }, [data, selectMetric]);

  const playsLikeUiEnabled = playsLikeEnabled && rcPlaysLikeEnabled && playsLikeVariant === "v1";

  const playsLikeData = useMemo(() => {
    if (!playsLikeUiEnabled) return null;
    const distance = selectMetric([
      "distanceMeters",
      "distance_m",
      "carry",
      "carry_m",
      "carryMeters",
    ]);
    const deltaH = selectMetric(["deltaH", "delta_h", "elevationDelta", "elevation_delta"]);
    const wind = selectMetric(["windParallel", "wind_parallel", "windHead", "wind_head"]);
    const temperatureC = selectMetric([
      "temperatureC",
      "temperature_c",
      "ambientTempC",
      "ambient_temp_c",
      "weatherTemperatureC",
      "weather_temp_c",
    ]);
    const temperatureF = selectMetric([
      "temperatureF",
      "temperature_f",
      "ambientTempF",
      "ambient_temp_f",
      "weatherTemperatureF",
      "weather_temp_f",
    ]);
    const altitudeM = selectMetric([
      "altitudeMeters",
      "altitude_m",
      "courseAltitudeM",
      "course_altitude_m",
      "elevationAslM",
      "asl_m",
    ]);
    const altitudeFt = selectMetric([
      "altitudeFeet",
      "altitude_ft",
      "courseAltitudeFt",
      "course_altitude_ft",
      "elevationAslFt",
      "asl_ft",
    ]);
    return {
      distanceMeters: distance ?? undefined,
      deltaHMeters: deltaH ?? undefined,
      windParallel: wind ?? undefined,
      temperature:
        temperatureC !== undefined
          ? { value: temperatureC, unit: "C" as const }
          : temperatureF !== undefined
            ? { value: temperatureF, unit: "F" as const }
            : null,
      altitude:
        altitudeM !== undefined
          ? { value: altitudeM, unit: "m" as const }
          : altitudeFt !== undefined
            ? { value: altitudeFt, unit: "ft" as const }
            : null,
    };
  }, [playsLikeUiEnabled, selectMetric]);

  const temperatureMeasurement = playsLikeData?.temperature ?? null;
  const altitudeMeasurement = playsLikeData?.altitude ?? null;

  const resolvedTempAlt = useMemo<TempAltOverrides | null>(() => {
    if (!tempAltSettings) return null;
    return {
      ...tempAltSettings,
      temperature: temperatureMeasurement,
      altitudeASL: altitudeMeasurement,
    };
  }, [altitudeMeasurement, tempAltSettings, temperatureMeasurement]);

  const canExport = visualTracerEnabled && !!backView?.videoUrl && !!backView.trace;

  useEffect(() => {
    if (!playsLikeEnabled) {
      setRcPlaysLikeEnabled(false);
      setPlaysLikeVariant("off");
      lastAssignSignature.current = null;
      setTempAltSettings(null);
      return;
    }
    const targetTier = remoteTier ?? "tierA";
    if (lastPlaysLikeTier.current === targetTier) {
      return;
    }
    lastPlaysLikeTier.current = targetTier;
    let cancelled = false;
    getRemoteConfig()
      .then((snapshot) => {
        if (cancelled || !snapshot) return;
        const tierConfig = snapshot.config[targetTier] ?? snapshot.config.tierA ?? {};
        const playsLikeBlock = tierConfig?.playsLike as Record<string, unknown> | undefined;
        const cfg = playsLikeBlock as Partial<PlaysLikeCfg> | undefined;
        const merged = mergePlaysLikeCfg(cfg);
        setPlaysLikeCfg(merged);
        const enabled = Boolean(tierConfig?.playsLikeEnabled);
        setRcPlaysLikeEnabled(enabled);
        const variantRaw = String(tierConfig?.ui?.playsLikeVariant ?? "off").toLowerCase();
        const normalizedVariant = variantRaw === "v1" ? "v1" : "off";
        setPlaysLikeVariant(normalizedVariant as "off" | "v1");
        const tempAltRaw =
          playsLikeBlock && typeof playsLikeBlock === "object"
            ? (playsLikeBlock["tempAlt"] as Record<string, unknown> | undefined)
            : undefined;
        const parseNumber = (value: unknown): number | undefined => {
          if (typeof value === "number" && Number.isFinite(value)) return value;
          if (typeof value === "string") {
            const parsed = Number.parseFloat(value);
            if (Number.isFinite(parsed)) return parsed;
          }
          return undefined;
        };
        const resolvedTempAlt: TempAltOverrides | null = tempAltRaw
          ? {
              enable: Boolean(tempAltRaw?.["enabled"]),
              betaPerC: parseNumber(tempAltRaw?.["betaPerC"]),
              gammaPer100m: parseNumber(tempAltRaw?.["gammaPer100m"]),
              caps: tempAltRaw?.["caps"] && typeof tempAltRaw.caps === "object"
                ? {
                    perComponent: parseNumber(
                      (tempAltRaw.caps as Record<string, unknown>)["perComponent"],
                    ),
                    total: parseNumber(
                      (tempAltRaw.caps as Record<string, unknown>)["total"],
                    ),
                  }
                : undefined,
            }
          : null;
        setTempAltSettings(resolvedTempAlt);
        const signature = [
          targetTier,
          enabled ? "1" : "0",
          normalizedVariant,
          merged.slopeFactor.toFixed(3),
          merged.alphaHead_per_mph.toFixed(4),
          merged.alphaTail_per_mph.toFixed(4),
        ].join("|");
        if (lastAssignSignature.current !== signature) {
          lastAssignSignature.current = signature;
          postTelemetryEvent({
            event: "plays_like_assign",
            variant: normalizedVariant,
            tier: targetTier,
            kS: merged.slopeFactor,
            alphaHead: merged.alphaHead_per_mph,
            alphaTail: merged.alphaTail_per_mph,
          }).catch((err) => {
            console.warn("Failed to emit plays_like_assign", err);
          });
        }
      })
      .catch((err) => {
        console.warn("Failed to load remote plays-like config", err);
        if (!cancelled) {
          setPlaysLikeCfg(mergePlaysLikeCfg());
          setRcPlaysLikeEnabled(false);
          setPlaysLikeVariant("off");
          lastAssignSignature.current = null;
          lastPlaysLikeTier.current = null;
          setTempAltSettings(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [remoteTier, playsLikeEnabled]);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    getRun(id)
      .then((payload) => {
        if (!mounted) return;
        setData(payload);
      })
      .catch((err) => {
        console.error(err);
        if (mounted) setError("Failed to load run details.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Run detail</h1>
          <p className="text-sm text-slate-400">
            Inspect the raw payload produced by the analyzer.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/runs"
            className="rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800/80"
          >
            Back to runs
          </Link>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-md border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-200 opacity-60"
            title="Re-analyze coming soon"
          >
            Re-analyze
          </button>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            disabled={!canExport}
            className="rounded-md border border-sky-500/40 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export Traced Video
          </button>
        </div>
      </div>
      {playsLikeUiEnabled ? (
        <PlaysLikePanel
          enabled={playsLikeUiEnabled}
          distanceMeters={playsLikeData?.distanceMeters}
          deltaHMeters={playsLikeData?.deltaHMeters}
          windParallel={playsLikeData?.windParallel}
          cfg={playsLikeCfg}
          tempAlt={resolvedTempAlt}
        />
      ) : null}

      {loading && (
        <div className="rounded-md border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-300">
          Loading run…
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {!loading && data?.impact_preview && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
          Impact preview saved as{" "}
          <a
            href={String(data.impact_preview)}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-emerald-200 underline decoration-dotted"
          >
            impact_preview.zip
          </a>
          .
        </div>
      )}

      {!loading && visualTracerEnabled && backView && (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-800/60 bg-slate-950/60">
            {backView.videoUrl ? (
              <video
                src={backView.videoUrl}
                className="h-full w-full object-cover opacity-70"
                controls
                muted
                loop
                playsInline
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                Back-view preview not available
              </div>
            )}
            {backView.trace ? (
              <TracerCanvas trace={backView.trace} className="absolute inset-0" />
            ) : (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs uppercase tracking-wide text-slate-500">
                No tracer points provided
              </div>
            )}
            {backView.ghostFrames && backView.ghostFrames.length > 0 && (
              <GhostFrames frames={backView.ghostFrames} trace={backView.trace} className="absolute inset-0" />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {qualityBadges.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {qualityBadges.map((item) => (
                  <span
                    key={item.key}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200"
                  >
                    <span className="uppercase tracking-wide text-[0.65rem] text-emerald-300/80">
                      {item.key.replace(/[_-]/g, " ")}
                    </span>
                    {item.value && <span className="text-slate-200">{item.value}</span>}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-slate-500">No quality flags reported.</span>
            )}
            <div className="flex flex-col gap-1 text-xs text-slate-400">
              {pipelineSource && (
                <span>
                  Pipeline: <span className="font-mono text-slate-200">{pipelineSource}</span>
                </span>
              )}
              {headerSource && headerSource !== pipelineSource && (
                <span>
                  x-cv-source: <span className="font-mono text-slate-200">{headerSource}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && data && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 shadow-lg">
          <div className="border-b border-slate-800 bg-slate-900/60 px-4 py-3 text-xs uppercase tracking-wide text-slate-400">
            Run payload
          </div>
          <pre className="overflow-x-auto bg-slate-950/90 px-4 py-4 text-xs leading-relaxed text-emerald-100">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}

      <ExportPanel
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        runId={id ?? null}
        videoUrl={backView?.videoUrl ?? null}
        trace={backView?.trace ?? null}
        metrics={metricOverlays}
      />
    </section>
  );
}

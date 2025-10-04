import { useEffect, useMemo, useState } from "react";
import {
  TelemetryAggregate,
  fetchTelemetryAggregate,
  getRemoteConfig,
  postRemoteConfig,
  RemoteConfigSnapshot,
  RemoteConfigTier,
} from "../api";

const numberFormatter = new Intl.NumberFormat("en-US");

type RemoteConfigState = {
  snapshot: RemoteConfigSnapshot | null;
  etag: string | null;
  text: string;
};

export default function DeviceDashboardPage() {
  const [aggregate, setAggregate] = useState<TelemetryAggregate | null>(null);
  const [loadingAggregate, setLoadingAggregate] = useState(true);
  const [aggregateError, setAggregateError] = useState<string | null>(null);

  const [configState, setConfigState] = useState<RemoteConfigState>({
    snapshot: null,
    etag: null,
    text: "",
  });
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaving, setConfigSaving] = useState(false);

  const [adminToken, setAdminToken] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("remoteConfigAdminToken") ?? "";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("remoteConfigAdminToken", adminToken);
  }, [adminToken]);

  const loadAggregate = () => {
    setLoadingAggregate(true);
    setAggregateError(null);
    fetchTelemetryAggregate()
      .then((data) => {
        setAggregate(data);
      })
      .catch((err) => {
        console.error(err);
        setAggregateError("Failed to load telemetry aggregates.");
      })
      .finally(() => setLoadingAggregate(false));
  };

  const loadRemoteConfig = (etag?: string | null) => {
    setConfigError(null);
    getRemoteConfig(etag ?? undefined)
      .then((snapshot) => {
        if (!snapshot) {
          return; // no change
        }
        setConfigState({
          snapshot,
          etag: snapshot.etag,
          text: JSON.stringify(snapshot.config, null, 2),
        });
      })
      .catch((err) => {
        console.error(err);
        setConfigError("Failed to load remote config.");
      });
  };

  useEffect(() => {
    loadAggregate();
    loadRemoteConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tierCards = useMemo(() => {
    if (!aggregate) return null;
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {aggregate.tiers.map((tier) => (
          <div
            key={tier.tier}
            className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow"
          >
            <div className="text-xs uppercase text-slate-400">Tier</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-300">{tier.tier}</div>
            <div className="mt-2 text-sm text-slate-300">
              {numberFormatter.format(tier.count)} devices
            </div>
          </div>
        ))}
      </div>
    );
  }, [aggregate]);

  const runtimeList = useMemo(() => {
    if (!aggregate || aggregate.runtimeDistribution.length === 0) return null;
    return (
      <ul className="space-y-2">
        {aggregate.runtimeDistribution.map((entry) => (
          <li
            key={entry.runtime}
            className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2"
          >
            <span className="text-sm font-medium text-slate-200">{entry.runtime}</span>
            <span className="text-xs text-slate-400">
              {numberFormatter.format(entry.count)} samples
            </span>
          </li>
        ))}
      </ul>
    );
  }, [aggregate]);

  const latencyChart = useMemo(() => {
    if (!aggregate || aggregate.latencyP95.length === 0) return null;
    const maxLatency = Math.max(...aggregate.latencyP95.map((entry) => entry.p95));
    return (
      <div className="space-y-3">
        {aggregate.latencyP95.map((entry) => {
          const ratio = maxLatency === 0 ? 0 : entry.p95 / maxLatency;
          const widthPercent = Math.min(100, Math.max(10, ratio * 100));
          return (
            <div key={`${entry.model}-${entry.os}`} className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>
                  {entry.model} · {entry.os}
                </span>
                <span>{entry.p95.toFixed(2)} ms · {entry.samples} samples</span>
              </div>
              <div className="h-2 rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-400/80"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [aggregate]);

  const handleConfigSave = async () => {
    if (!configState.text.trim()) {
      setConfigError("Configuration cannot be empty.");
      return;
    }
    if (!adminToken) {
      setConfigError("Provide an admin token to update remote config.");
      return;
    }
    try {
      setConfigError(null);
      const parsed = JSON.parse(configState.text) as Record<string, RemoteConfigTier>;
      setConfigSaving(true);
      const snapshot = await postRemoteConfig(parsed, adminToken);
      setConfigState({
        snapshot,
        etag: snapshot.etag,
        text: JSON.stringify(snapshot.config, null, 2),
      });
      setConfigError(null);
    } catch (err) {
      console.error(err);
      if (err instanceof SyntaxError) {
        setConfigError("Configuration must be valid JSON.");
      } else {
        setConfigError("Failed to update remote config.");
      }
    } finally {
      setConfigSaving(false);
    }
  };

  return (
    <section className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Device Telemetry</h1>
        <p className="text-sm text-slate-400">
          Aggregated device signals from the flight-recorder along with the remote configuration overrides in effect.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {aggregate?.generatedAt ? `Generated ${new Date(aggregate.generatedAt).toLocaleString()}` : ""}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadAggregate()}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300"
          >
            Refresh Metrics
          </button>
          <button
            onClick={() => loadRemoteConfig(configState.etag)}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300"
          >
            Refresh Config
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Device tiers</h2>
        {loadingAggregate ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : aggregateError ? (
          <p className="text-sm text-red-300">{aggregateError}</p>
        ) : (
          tierCards
        )}
      </div>

      {aggregate && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Top runtimes</h2>
            {runtimeList ?? (
              <p className="text-sm text-slate-400">No runtime signals yet.</p>
            )}
            <div className="space-y-2">
              <h3 className="text-base font-semibold">Config hashes</h3>
              {aggregate.configHashes.length > 0 ? (
                <ul className="space-y-2 text-sm text-slate-300">
                  {aggregate.configHashes.map((entry) => (
                    <li key={entry.hash} className="flex justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
                      <span className="font-mono text-xs text-emerald-200">{entry.hash}</span>
                      <span className="text-xs text-slate-400">{numberFormatter.format(entry.count)} devices</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">No config telemetry yet.</p>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">p95 latency (ms)</h2>
            {latencyChart ?? (
              <p className="text-sm text-slate-400">No latency samples yet.</p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Remote config</h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div className="space-y-3">
            <textarea
              value={configState.text}
              onChange={(event) =>
                setConfigState((prev) => ({ ...prev, text: event.target.value }))
              }
              rows={16}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 p-3 font-mono text-xs text-slate-200 focus:border-emerald-400 focus:outline-none"
              placeholder="{\n  \"tierA\": { … }\n}"
            />
            {configError && <p className="text-sm text-red-300">{configError}</p>}
            <button
              onClick={handleConfigSave}
              disabled={configSaving}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-60"
            >
              {configSaving ? "Saving…" : "Save config"}
            </button>
          </div>
          <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
            <div>
              <div className="text-xs uppercase text-slate-500">Admin token</div>
              <input
                type="password"
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-400 focus:outline-none"
                placeholder="Required to POST"
              />
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">ETag</div>
              <div className="mt-1 font-mono text-xs text-emerald-200 break-all">
                {configState.etag ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Last updated</div>
              <div className="mt-1 text-xs text-slate-400">
                {configState.snapshot?.updatedAt
                  ? new Date(configState.snapshot.updatedAt).toLocaleString()
                  : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

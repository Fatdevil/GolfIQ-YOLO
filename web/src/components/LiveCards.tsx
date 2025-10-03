import { useEffect, useMemo, useRef, useState } from "react";
import MetricCard from "./MetricCard";
import { API } from "../api";
import { mphFromMps, yardsFromMeters } from "../lib/traceUtils";

type TelemetryMetrics = {
  ballSpeed?: number;
  ballSpeedMph?: number;
  clubSpeed?: number;
  clubSpeedMph?: number;
  sideAngle?: number;
  vertLaunch?: number;
  carry?: number;
  carryYards?: number;
};

type ConnectionState = "idle" | "connecting" | "open" | "closed" | "error";

const numberFrom = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const candidates = (record: Record<string, unknown>, keys: string[]): number | undefined => {
  for (const key of keys) {
    if (record[key] !== undefined) {
      const value = numberFrom(record[key]);
      if (value !== undefined) return value;
    }
  }
  return undefined;
};

const buildWsUrl = (base: string) => {
  try {
    const url = new URL(base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws/telemetry";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch (error) {
    console.warn("Unable to construct telemetry websocket URL", error);
    return null;
  }
};

const formatStatus = (state: ConnectionState) => {
  switch (state) {
    case "open":
      return "Live";
    case "connecting":
      return "Connecting";
    case "closed":
      return "Disconnected";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
};

export default function LiveCards() {
  const [metrics, setMetrics] = useState<TelemetryMetrics>({});
  const [status, setStatus] = useState<ConnectionState>("idle");
  const lastUpdateRef = useRef<number | null>(null);

  const wsUrl = useMemo(() => buildWsUrl(API), []);

  useEffect(() => {
    if (typeof window === "undefined" || !wsUrl) {
      return undefined;
    }

    let ws: WebSocket | null = null;
    let active = true;
    let reconnectTimer: number | null = null;

    const openConnection = () => {
      setStatus("connecting");
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        if (!active) return;
        setStatus("open");
      };
      const scheduleReconnect = () => {
        if (!active) return;
        if (reconnectTimer) {
          window.clearTimeout(reconnectTimer);
        }
        reconnectTimer = window.setTimeout(() => {
          if (!active) return;
          openConnection();
        }, 3000);
      };
      ws.onclose = () => {
        if (!active) return;
        setStatus("closed");
        scheduleReconnect();
      };
      ws.onerror = (event) => {
        console.error("Telemetry websocket error", event);
        if (!active) return;
        setStatus("error");
        scheduleReconnect();
      };
      ws.onmessage = (event) => {
        if (!active) return;
        try {
          const payload = JSON.parse(event.data);
          if (!payload || typeof payload !== "object") return;
          const record = payload as Record<string, unknown>;

          const ballSpeed =
            candidates(record, ["ballSpeed", "ball_speed", "ball_speed_mps", "ball_speed_m_s"]) ?? undefined;
          const clubSpeed =
            candidates(record, ["clubSpeed", "club_speed", "club_speed_mps", "club_speed_m_s"]) ?? undefined;
          const sideAngle = candidates(record, ["sideAngle", "side_angle", "side", "side_deg"]);
          const vertLaunch = candidates(record, ["vertLaunch", "launchAngle", "vert_launch", "launch_deg"]);
          const carry = candidates(record, ["carry", "carry_m", "carryMeters", "carry_meters"]);

          const next: TelemetryMetrics = {
            ballSpeed,
            clubSpeed,
            sideAngle,
            vertLaunch,
            carry,
          };

          const ballSpeedMph =
            candidates(record, ["ballSpeedMph", "ball_speed_mph", "ballSpeedMPH"]) ??
            mphFromMps(ballSpeed ?? undefined);
          const clubSpeedMph =
            candidates(record, ["clubSpeedMph", "club_speed_mph", "clubSpeedMPH"]) ??
            mphFromMps(clubSpeed ?? undefined);
          if (ballSpeedMph !== undefined) next.ballSpeedMph = ballSpeedMph;
          if (clubSpeedMph !== undefined) next.clubSpeedMph = clubSpeedMph;

          const carryYards = candidates(record, ["carryYards", "carry_yards", "carryYd"]) ?? yardsFromMeters(carry ?? undefined);
          if (carryYards !== undefined) next.carryYards = carryYards;

          setMetrics(next);
          lastUpdateRef.current = Date.now();
        } catch (error) {
          console.warn("Failed to parse telemetry payload", error);
        }
      };
    };

    openConnection();

    return () => {
      active = false;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [wsUrl]);

  const statusLabel = formatStatus(status);

  const sinceUpdate = lastUpdateRef.current
    ? Math.round((Date.now() - lastUpdateRef.current) / 1000)
    : null;

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
        <span>Live telemetry</span>
        <span className="flex items-center gap-2">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              status === "open"
                ? "bg-emerald-400"
                : status === "connecting"
                ? "bg-amber-400"
                : status === "error"
                ? "bg-red-500"
                : "bg-slate-500"
            }`}
            aria-hidden
          />
          {statusLabel}
          {sinceUpdate != null && status === "open" && (
            <span className="font-normal normal-case text-slate-500">{sinceUpdate}s ago</span>
          )}
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Ball Speed"
          value={metrics.ballSpeed}
          unit="m/s"
          secondary={metrics.ballSpeedMph ? `${metrics.ballSpeedMph.toFixed(1)} mph` : undefined}
        />
        <MetricCard
          title="Club Speed"
          value={metrics.clubSpeed}
          unit="m/s"
          secondary={metrics.clubSpeedMph ? `${metrics.clubSpeedMph.toFixed(1)} mph` : undefined}
        />
        <MetricCard
          title="Side Launch"
          value={metrics.sideAngle}
          unit="°"
        />
        <MetricCard
          title="Vertical Launch"
          value={metrics.vertLaunch}
          unit="°"
        />
        <MetricCard
          title="Carry"
          value={metrics.carry}
          unit="m"
          secondary={metrics.carryYards ? `${metrics.carryYards.toFixed(1)} yd` : undefined}
        />
      </div>
      {status !== "open" && (
        <p className="text-xs text-slate-500">
          Telemetry updates automatically when connected to /ws/telemetry.
        </p>
      )}
    </section>
  );
}

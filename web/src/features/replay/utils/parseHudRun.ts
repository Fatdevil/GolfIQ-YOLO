import type { ArhudState } from "@shared/arhud/state_machine";

export type HudTelemetryEvent = {
  timestampMs?: number;
  event: string;
  data?: Record<string, unknown> | null;
};

export type HudRunFrame = {
  timeMs: number;
  timeSec: number;
  fps?: number | null;
  latencyMs?: number | null;
  headingRaw?: number | null;
  headingSmoothed?: number | null;
  rms?: number | null;
  state?: ArhudState | null;
};

export type HudRecenterEvent = {
  timeMs: number;
  timeSec: number;
  elapsedMs?: number | null;
  state?: ArhudState | null;
};

export type HudTimelineSegment = {
  state: ArhudState;
  startMs: number;
  endMs: number;
  startSec: number;
  endSec: number;
};

export type HudRecenterInterval = {
  startMs: number;
  endMs: number;
  startSec: number;
  endSec: number;
};

export type HudRunSummary = {
  sessionId?: string | null;
  device?: string | null;
  os?: string | null;
  appVersion?: string | null;
  startedAtMs?: number | null;
  endedAtMs?: number | null;
  durationMs?: number | null;
  avgFps?: number | null;
  p95Latency?: number | null;
  rmsMean?: number | null;
  recenterCount: number;
  recenterAvgMs?: number | null;
  recenterMaxMs?: number | null;
};

export type ParsedHudRun = {
  events: HudTelemetryEvent[];
  frames: HudRunFrame[];
  recenterEvents: HudRecenterEvent[];
  recenterIntervals: HudRecenterInterval[];
  timeline: HudTimelineSegment[];
  summary: HudRunSummary;
};

const STATE_ORDER: ArhudState[] = ["AIM", "CALIBRATE", "TRACK", "RECENTER"];

function coerceEvent(raw: unknown): HudTelemetryEvent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const event = record["event"];
  if (typeof event !== "string") {
    return null;
  }
  const timestampMs = record["timestampMs"];
  const data = record["data"];
  return {
    event,
    timestampMs: typeof timestampMs === "number" ? timestampMs : undefined,
    data: data && typeof data === "object" ? (data as Record<string, unknown>) : undefined,
  };
}

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickState(value: unknown): ArhudState | null {
  if (typeof value !== "string") return null;
  return STATE_ORDER.includes(value as ArhudState) ? (value as ArhudState) : null;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

export function parseHudRun(input: string | unknown[]): ParsedHudRun {
  let parsed: unknown;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch (error) {
      throw new Error("hud_run.json is not valid JSON");
    }
  } else {
    parsed = input;
  }

  if (!Array.isArray(parsed)) {
    throw new Error("hud_run.json must be a JSON array of events");
  }

  const events: HudTelemetryEvent[] = parsed
    .map(coerceEvent)
    .filter((event): event is HudTelemetryEvent => event !== null);

  if (!events.length) {
    throw new Error("hud_run.json did not contain any telemetry events");
  }

  const sorted = [...events].sort(compareEventTime);

  const sessionStart = sorted.find((event) => event.event === "hud.session.start");
  let sessionEnd: HudTelemetryEvent | undefined;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (sorted[i].event === "hud.session.end") {
      sessionEnd = sorted[i];
      break;
    }
  }

  const originMs =
    getEventTimeMs(sessionStart) ?? getEventTimeMs(sorted[0]) ?? sorted[0].timestampMs ?? 0;

  const frames: HudRunFrame[] = [];
  const latencyValues: number[] = [];
  const fpsValues: number[] = [];
  const rmsValues: number[] = [];

  const recenterEvents: HudRecenterEvent[] = [];
  const recenterDurations: number[] = [];

  sorted.forEach((event) => {
    if (event.event === "hud.frame") {
      const timeMs = getEventTimeMs(event) ?? originMs;
      const data = event.data ?? {};
      const fps = pickNumber(data["fps"]);
      const latencyMs = pickNumber(data["latencyMs"]);
      const headingRaw = pickNumber(data["headingRaw"]);
      const headingSmoothed = pickNumber(data["headingSmoothed"]);
      const rms = pickNumber(data["rms"]);
      const state = pickState(data["state"]);

      if (fps !== null) fpsValues.push(fps);
      if (latencyMs !== null) latencyValues.push(latencyMs);
      if (rms !== null) rmsValues.push(rms);

      frames.push({
        timeMs,
        timeSec: (timeMs - originMs) / 1000,
        fps,
        latencyMs,
        headingRaw,
        headingSmoothed,
        rms,
        state,
      });
    } else if (event.event === "hud.recenter") {
      const timeMs = getEventTimeMs(event) ?? originMs;
      const data = event.data ?? {};
      const elapsedMs = pickNumber(data["elapsedSinceRequest"]);
      const state = pickState(data["state"]);
      if (elapsedMs !== null) {
        recenterDurations.push(elapsedMs);
      }
      recenterEvents.push({
        timeMs,
        timeSec: (timeMs - originMs) / 1000,
        elapsedMs,
        state,
      });
    }
  });

  const timeline = buildTimeline(frames, originMs);
  const recenterIntervals = buildRecenterIntervals(frames, originMs);

  const sessionData = sessionStart?.data ?? {};
  const endData = sessionEnd?.data ?? {};
  const endedAtMs = getEventTimeMs(sessionEnd);
  const durationMs =
    (typeof endData["duration"] === "number"
      ? endData["duration"] * 1000
      : endedAtMs !== null
        ? endedAtMs - originMs
        : frames.length > 0
          ? frames[frames.length - 1].timeMs - originMs
          : null) ?? null;

  const avgFps =
    typeof endData["avgFps"] === "number"
      ? (Number.isFinite(endData["avgFps"]) ? endData["avgFps"] : null)
      : mean(fpsValues);
  const p95Latency =
    typeof endData["p95Latency"] === "number"
      ? (Number.isFinite(endData["p95Latency"]) ? endData["p95Latency"] : null)
      : percentile(latencyValues, 0.95);
  const rmsMean =
    typeof endData["rmsMean"] === "number"
      ? (Number.isFinite(endData["rmsMean"]) ? endData["rmsMean"] : null)
      : mean(rmsValues);

  const recenterCount = recenterEvents.length;
  const recenterAvgMs = mean(recenterDurations);
  const recenterMaxMs = recenterDurations.length
    ? Math.max(...recenterDurations)
    : null;

  return {
    events: sorted,
    frames,
    recenterEvents,
    recenterIntervals,
    timeline,
    summary: {
      sessionId: typeof sessionData["sessionId"] === "string" ? sessionData["sessionId"] : null,
      device: typeof sessionData["device"] === "string" ? sessionData["device"] : null,
      os: typeof sessionData["os"] === "string" ? sessionData["os"] : null,
      appVersion:
        typeof sessionData["appVersion"] === "string" ? sessionData["appVersion"] : null,
      startedAtMs: getEventTimeMs(sessionStart),
      endedAtMs,
      durationMs,
      avgFps: avgFps ?? null,
      p95Latency: p95Latency ?? null,
      rmsMean: rmsMean ?? null,
      recenterCount,
      recenterAvgMs: recenterAvgMs ?? null,
      recenterMaxMs,
    },
  };
}

function getEventTimeMs(event: HudTelemetryEvent | undefined): number | null {
  if (!event) {
    return null;
  }
  const data = event.data;
  if (data && typeof data["t"] === "number") {
    return data["t"];
  }
  if (typeof event.timestampMs === "number") {
    return event.timestampMs;
  }
  return null;
}

function compareEventTime(a: HudTelemetryEvent, b: HudTelemetryEvent): number {
  const timeA = getEventTimeMs(a);
  const timeB = getEventTimeMs(b);
  if (timeA === null && timeB === null) {
    return 0;
  }
  if (timeA === null) {
    return -1;
  }
  if (timeB === null) {
    return 1;
  }
  return timeA - timeB;
}

function buildTimeline(frames: HudRunFrame[], originMs: number): HudTimelineSegment[] {
  const segments: HudTimelineSegment[] = [];
  let current: HudTimelineSegment | null = null;

  for (const frame of frames) {
    if (!frame.state) {
      continue;
    }
    if (!current) {
      current = makeSegment(frame.state, frame.timeMs, originMs);
      segments.push(current);
      continue;
    }
    if (frame.state !== current.state) {
      current.endMs = frame.timeMs;
      current.endSec = (frame.timeMs - originMs) / 1000;
      current = makeSegment(frame.state, frame.timeMs, originMs);
      segments.push(current);
    } else {
      current.endMs = frame.timeMs;
      current.endSec = (frame.timeMs - originMs) / 1000;
    }
  }

  if (current && current.endMs < current.startMs) {
    current.endMs = current.startMs;
    current.endSec = current.startSec;
  }

  return segments;
}

function makeSegment(state: ArhudState, startMs: number, originMs: number): HudTimelineSegment {
  return {
    state,
    startMs,
    endMs: startMs,
    startSec: (startMs - originMs) / 1000,
    endSec: (startMs - originMs) / 1000,
  };
}

function buildRecenterIntervals(
  frames: HudRunFrame[],
  originMs: number,
): HudRecenterInterval[] {
  const intervals: HudRecenterInterval[] = [];
  let active: HudRecenterInterval | null = null;

  for (const frame of frames) {
    if (frame.state === "RECENTER") {
      if (!active) {
        active = {
          startMs: frame.timeMs,
          endMs: frame.timeMs,
          startSec: (frame.timeMs - originMs) / 1000,
          endSec: (frame.timeMs - originMs) / 1000,
        };
      } else {
        active.endMs = frame.timeMs;
        active.endSec = (frame.timeMs - originMs) / 1000;
      }
    } else if (active) {
      if (frame.timeMs > active.endMs) {
        active.endMs = frame.timeMs;
        active.endSec = (frame.timeMs - originMs) / 1000;
      }
      intervals.push(active);
      active = null;
    }
  }

  if (active) {
    intervals.push(active);
  }

  return intervals;
}

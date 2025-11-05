import type { HazardRates } from "../caddie/strategy";
import type { RiskProfile } from "../caddie/strategy_profiles";

export type TelemetryEmitter = (event: string, data: Record<string, unknown>) => void;

export type CaddiePlaysLikeEvent = {
  rawDist_m: number;
  distance_m: number;
  factor: number;
  elevDiff_m: number;
  temp_C: number;
  headwind_mps: number;
};

export type CaddieStrategyEvent = {
  profile: RiskProfile;
  offset_m: number;
  carry_m: number;
  evScore: number;
  hazard: HazardRates;
  fairway: number;
  sigma_m: number;
  lateralSigma_m?: number;
};

export type CaddieWatchAcceptEvent = {
  club: string;
  profile?: RiskProfile | null;
  ts?: number;
  context?: Record<string, unknown> | null;
};

export type CaddieWatchAcceptPayload = {
  club: string;
  profile: RiskProfile | null;
  ts: number;
  context: Record<string, unknown>;
};

type CaddieWatchAcceptListener = (payload: CaddieWatchAcceptPayload) => void;

const acceptListeners = new Set<CaddieWatchAcceptListener>();

const sanitizeTimestamp = (value: unknown): number => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return Date.now();
};

const sanitizeContext = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object") {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
};

let playsLikeTelemetryEnabled = false;

export function setEnableCaddieTelemetry(value: boolean): void {
  playsLikeTelemetryEnabled = value === true;
}

export function isCaddieTelemetryEnabled(): boolean {
  return playsLikeTelemetryEnabled;
}

export function emitCaddiePlaysLikeTelemetry(
  emitter: TelemetryEmitter | null | undefined,
  payload: CaddiePlaysLikeEvent,
): void {
  if (!playsLikeTelemetryEnabled) {
    return;
  }
  if (typeof emitter !== "function") {
    return;
  }
  try {
    emitter("caddie.playslike.v1", payload);
  } catch (error) {
    // ignore emitter failures
  }
}

export function emitCaddieStrategyTelemetry(
  emitter: TelemetryEmitter | null | undefined,
  payload: CaddieStrategyEvent,
): void {
  if (!playsLikeTelemetryEnabled) {
    return;
  }
  if (typeof emitter !== "function") {
    return;
  }
  try {
    emitter("caddie.strategy.v1", payload);
  } catch (error) {
    // ignore emitter failures
  }
}

export function emitCaddieWatchAcceptTelemetry(
  emitter: TelemetryEmitter | null | undefined,
  payload: CaddieWatchAcceptEvent,
): void {
  if (typeof emitter !== "function") {
    // still notify listeners
  }
  const club = typeof payload.club === "string" && payload.club.trim() ? payload.club.trim() : "";
  if (!club) {
    return;
  }
  const profile = payload.profile ?? null;
  const ts = sanitizeTimestamp(payload.ts);
  const context = sanitizeContext(payload.context);
  const eventPayload = {
    club,
    profile,
    ts,
    context,
  } satisfies CaddieWatchAcceptPayload;
  try {
    if (typeof emitter === "function") {
      emitter("caddie.watch.accept", eventPayload);
    }
  } catch (error) {
    // ignore emitter failures
  }
  for (const listener of acceptListeners) {
    try {
      listener(eventPayload);
    } catch {
      // ignore listener failures
    }
  }
}

export function onCaddieWatchAccept(listener: CaddieWatchAcceptListener): () => void {
  acceptListeners.add(listener);
  return () => {
    acceptListeners.delete(listener);
  };
}

export type LearningApplyEvent = {
  profile: RiskProfile;
  club: string;
  delta: number;
  sampleN: number;
  before: number;
  after: number;
};

export function emitLearningApplyTelemetry(
  emitter: TelemetryEmitter | null | undefined,
  payload: LearningApplyEvent,
): void {
  if (typeof emitter !== "function") {
    return;
  }
  const club = typeof payload.club === "string" && payload.club.trim() ? payload.club.trim() : "";
  if (!club) {
    return;
  }
  const profile: RiskProfile = payload.profile ?? 'neutral';
  try {
    emitter("learning.apply", {
      club,
      profile,
      delta: Number(payload.delta ?? 0),
      sampleN: Number(payload.sampleN ?? 0),
      before: Number(payload.before ?? 0),
      after: Number(payload.after ?? 0),
    });
  } catch {
    // ignore emitter errors
  }
}

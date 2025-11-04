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
    return;
  }
  const club = typeof payload.club === "string" && payload.club.trim() ? payload.club.trim() : "";
  try {
    emitter("caddie.watch.accept", { club });
  } catch (error) {
    // ignore emitter failures
  }
}

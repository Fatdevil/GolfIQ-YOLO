import { clampRolloutPercent } from "./rollout";

export type RcRecord = Record<string, unknown> | null | undefined;

export type CaddieFeatureRc = {
  enabled: boolean;
  percent: number;
};

export type CaddieRc = {
  mc: CaddieFeatureRc;
  advice: CaddieFeatureRc;
  tts: CaddieFeatureRc;
};

const DEFAULT_RC: CaddieRc = {
  mc: { enabled: false, percent: 0 },
  advice: { enabled: true, percent: 100 },
  tts: { enabled: false, percent: 0 },
};

function getGlobalRc(): RcRecord {
  if (typeof globalThis !== "undefined" && (globalThis as Record<string, unknown>).RC) {
    return (globalThis as Record<string, unknown>).RC as RcRecord;
  }
  return undefined;
}

function normalizeBoolean(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return ["1", "true", "yes", "on"].includes(normalized);
  }
  return false;
}

function readRcValue(rc: RcRecord, key: string): unknown {
  if (!rc || typeof rc !== "object") {
    return undefined;
  }
  return (rc as Record<string, unknown>)[key];
}

function readFeature(rc: RcRecord, prefix: string, fallback: CaddieFeatureRc): CaddieFeatureRc {
  const enabledRaw = readRcValue(rc, `${prefix}.enabled`);
  const percentRaw = readRcValue(rc, `${prefix}.percent`);
  const enabled =
    typeof enabledRaw === "undefined" ? fallback.enabled : normalizeBoolean(enabledRaw);
  const percent =
    typeof percentRaw === "undefined" ? fallback.percent : clampRolloutPercent(percentRaw);
  return {
    enabled,
    percent,
  };
}

export function readCaddieRc(rc?: RcRecord): CaddieRc {
  const source = rc ?? getGlobalRc();
  return {
    mc: readFeature(source, "caddie.mc", DEFAULT_RC.mc),
    advice: readFeature(source, "caddie.advice", DEFAULT_RC.advice),
    tts: readFeature(source, "caddie.tts", DEFAULT_RC.tts),
  };
}

export function getCaddieRc(): CaddieRc {
  return readCaddieRc(getGlobalRc());
}

export { clampRolloutPercent };

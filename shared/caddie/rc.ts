import { clampRolloutPercent } from "./rollout";

export type RcRecord = Record<string, unknown> | null | undefined;

export interface CaddieFeatureToggle {
  enabled: boolean;
  percent: number;
  kill?: boolean;
}

export interface CaddieDigestToggle {
  enabled?: boolean;
}

export interface CaddieRC {
  mc: CaddieFeatureToggle;
  advice: CaddieFeatureToggle;
  tts: CaddieFeatureToggle;
  digest?: CaddieDigestToggle;
}

export type CaddieRc = CaddieRC;

const DEFAULT_RC: CaddieRC = {
  mc: { enabled: false, percent: 0, kill: false },
  advice: { enabled: true, percent: 100, kill: false },
  tts: { enabled: false, percent: 0, kill: false },
  digest: { enabled: true },
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

function createGetterFromRecord(record: RcRecord): (key: string, defaultValue?: unknown) => unknown {
  return (key: string, defaultValue?: unknown) => {
    const value = readRcValue(record, key);
    return typeof value === "undefined" ? defaultValue : value;
  };
}

function coercePercent(value: unknown, fallback: number): number {
  if (typeof value === "undefined") {
    return fallback;
  }
  return clampRolloutPercent(value);
}

function readFeatureFromGetter(
  get: (key: string, defaultValue?: unknown) => unknown,
  prefix: string,
  fallback: CaddieFeatureToggle,
): CaddieFeatureToggle {
  const enabled = normalizeBoolean(get(`${prefix}.enabled`, fallback.enabled));
  const percent = coercePercent(get(`${prefix}.percent`, fallback.percent), fallback.percent);
  const kill = normalizeBoolean(get(`${prefix}.kill`, fallback.kill));
  return { enabled, percent, kill };
}

export function readCaddieRC(get: (key: string, defaultValue?: unknown) => unknown): CaddieRC {
  const fallback = DEFAULT_RC;
  const mc = readFeatureFromGetter(get, "caddie.mc", fallback.mc);
  const advice = readFeatureFromGetter(get, "caddie.advice", fallback.advice);
  const tts = readFeatureFromGetter(get, "caddie.tts", fallback.tts);
  const digestEnabledRaw = get("caddie.digest.enabled", fallback.digest?.enabled);
  const digest: CaddieDigestToggle | undefined = digestEnabledRaw === undefined && !fallback.digest
    ? undefined
    : { enabled: normalizeBoolean(digestEnabledRaw ?? fallback.digest?.enabled) };
  return { mc, advice, tts, digest };
}

export function readCaddieRc(rc?: RcRecord): CaddieRc {
  const getter = createGetterFromRecord(rc ?? getGlobalRc());
  return readCaddieRC(getter);
}

export function getCaddieRc(): CaddieRc {
  return readCaddieRc(getGlobalRc());
}

export { clampRolloutPercent };

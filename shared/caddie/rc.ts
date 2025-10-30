import type { TrainingFocus } from "../training/types";
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

export interface CaddieGreenToggle {
  enabled: boolean;
}

export interface CaddieGreenConfig {
  sections: CaddieGreenToggle;
  pinDrop: CaddieGreenToggle;
}

export interface CaddieRC {
  mc: CaddieFeatureToggle;
  advice: CaddieFeatureToggle;
  tts: CaddieFeatureToggle;
  digest?: CaddieDigestToggle;
  trainingFocusDefault?: TrainingFocus;
  coachPersonaDefault?: string;
  green: CaddieGreenConfig;
  coach: CoachLearningConfig;
  riskMax?: number;
}

export type CaddieRc = CaddieRC;

export interface CoachLearningConfig {
  learningEnabled: boolean;
  syncEnabled: boolean;
  decayHalfLifeDays: number;
}

const DEFAULT_RC: CaddieRC = {
  mc: { enabled: false, percent: 0, kill: false },
  advice: { enabled: true, percent: 100, kill: false },
  tts: { enabled: false, percent: 0, kill: false },
  digest: { enabled: true },
  green: {
    sections: { enabled: true },
    pinDrop: { enabled: true },
  },
  coach: {
    learningEnabled: true,
    syncEnabled: false,
    decayHalfLifeDays: 14,
  },
  riskMax: 0.42,
};

const TRAINING_FOCUS_VALUES: readonly TrainingFocus[] = [
  "long-drive",
  "tee",
  "approach",
  "wedge",
  "short",
  "putt",
  "recovery",
];
const TRAINING_FOCUS_SET = new Set(TRAINING_FOCUS_VALUES);

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

function coercePositiveNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
}

function coerceUnitInterval(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  if (numeric <= 0) {
    return 0;
  }
  if (numeric >= 1) {
    return 1;
  }
  return numeric;
}

function normalizeTrainingFocus(value: unknown): TrainingFocus | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return TRAINING_FOCUS_SET.has(trimmed as TrainingFocus)
    ? (trimmed as TrainingFocus)
    : undefined;
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
  const focusDefault = normalizeTrainingFocus(get("training.focus.default"));
  const personaRaw = get("coach.persona.default");
  const coachPersonaDefault =
    typeof personaRaw === "string" && personaRaw.trim().length > 0
      ? personaRaw.trim()
      : undefined;
  const greenSectionsEnabled = normalizeBoolean(
    get("rc.green.sections.enabled", fallback.green.sections.enabled),
  );
  const greenPinDropEnabled = normalizeBoolean(
    get("rc.green.pinDrop.enabled", fallback.green.pinDrop.enabled),
  );
  const coachLearningEnabled = normalizeBoolean(
    get("coach.learning.enabled", fallback.coach.learningEnabled),
  );
  const coachSyncEnabled = normalizeBoolean(
    get("coach.sync.enabled", fallback.coach.syncEnabled),
  );
  const coachDecayHalfLifeDays = coercePositiveNumber(
    get("coach.decay.halfLifeDays", fallback.coach.decayHalfLifeDays),
    fallback.coach.decayHalfLifeDays,
  );
  const riskMax = coerceUnitInterval(
    get("caddie.risk.max", get("riskMax", fallback.riskMax ?? 0.42)),
    fallback.riskMax ?? 0.42,
  );
  return {
    mc,
    advice,
    tts,
    digest,
    trainingFocusDefault: focusDefault,
    coachPersonaDefault,
    green: {
      sections: { enabled: greenSectionsEnabled },
      pinDrop: { enabled: greenPinDropEnabled },
    },
    coach: {
      learningEnabled: coachLearningEnabled,
      syncEnabled: coachSyncEnabled,
      decayHalfLifeDays: coachDecayHalfLifeDays,
    },
    riskMax,
  };
}

export function readCaddieRc(rc?: RcRecord): CaddieRc {
  const getter = createGetterFromRecord(rc ?? getGlobalRc());
  return readCaddieRC(getter);
}

export function getCaddieRc(): CaddieRc {
  return readCaddieRc(getGlobalRc());
}

export { clampRolloutPercent };

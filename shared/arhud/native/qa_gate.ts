const QA_ENV_KEYS = ["QA_HUD", "EXPO_PUBLIC_QA_HUD"] as const;

type EnvRecord = Partial<Record<(typeof QA_ENV_KEYS)[number], string | undefined>> &
  Record<string, string | undefined>;

type RcRecord = Record<string, unknown> | undefined | null;

type QaGateOverrides = {
  env?: EnvRecord;
  rc?: RcRecord;
  devFlag?: boolean;
};

let testOverrides: QaGateOverrides | null = null;

function readEnvFlag(env: EnvRecord | undefined): boolean {
  if (!env) {
    return false;
  }
  return QA_ENV_KEYS.some((key) => {
    const value = env[key];
    if (value === undefined || value === null) {
      return false;
    }
    const normalized = String(value).trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  });
}

function readRcFlag(rc: RcRecord): boolean {
  if (!rc || typeof rc !== "object") {
    return false;
  }
  const value = (rc as Record<string, unknown>)["qa.hud.enabled"];
  return value === true || value === "true";
}

function readDevFlag(flag: boolean | undefined): boolean {
  if (typeof flag === "boolean") {
    return flag;
  }
  if (typeof globalThis !== "undefined") {
    const maybeDev = (globalThis as Record<string, unknown>).__DEV__;
    if (typeof maybeDev === "boolean") {
      return maybeDev;
    }
  }
  return false;
}

function getGlobalRc(): RcRecord {
  if (typeof globalThis !== "undefined" && (globalThis as Record<string, unknown>).RC) {
    return (globalThis as Record<string, unknown>).RC as RcRecord;
  }
  return undefined;
}

function getProcessEnv(): EnvRecord | undefined {
  if (typeof globalThis === "undefined") {
    return undefined;
  }
  const maybeProcess = (globalThis as Record<string, unknown>).process as
    | { env?: EnvRecord }
    | undefined;
  return maybeProcess?.env;
}

export function shouldEnableQaHud(overrides: QaGateOverrides = {}): boolean {
  const env = overrides.env ?? getProcessEnv();
  const rc = overrides.rc ?? getGlobalRc();
  const devFlag = overrides.devFlag ?? undefined;

  return readEnvFlag(env) || readRcFlag(rc) || readDevFlag(devFlag);
}

export function __setQaGateForTests(overrides: QaGateOverrides | null): void {
  testOverrides = overrides;
}

export function qaHudEnabled(): boolean {
  if (testOverrides) {
    return shouldEnableQaHud(testOverrides);
  }
  return shouldEnableQaHud();
}

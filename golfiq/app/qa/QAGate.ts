const QA_HUD_ENV_KEY = 'QA_HUD';
const QA_DEV_ENV_KEY = 'QA_DEV';
const RC_FLAG_KEY = 'qa.hud.enabled';

type RcRecord = Record<string, unknown> | undefined | null;

type EnvRecord = Record<string, string | undefined> | undefined;

declare const __DEV__: boolean | undefined;

function readRcFlag(rc: RcRecord): boolean {
  if (!rc || typeof rc !== 'object') {
    return false;
  }
  const value = (rc as Record<string, unknown>)[RC_FLAG_KEY];
  return value === true;
}

function getGlobalRc(): RcRecord {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }
  const maybeRc = (globalThis as Record<string, unknown>).RC;
  if (maybeRc && typeof maybeRc === 'object') {
    return maybeRc as RcRecord;
  }
  return undefined;
}

function getProcessEnv(): EnvRecord {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }
  const maybeProcess = (globalThis as Record<string, unknown>).process as
    | { env?: EnvRecord }
    | undefined;
  return maybeProcess?.env;
}

function readEnvFlag(env: EnvRecord, key: string): boolean {
  if (!env) {
    return false;
  }
  return env[key] === '1';
}

export function isQAMode(): boolean {
  const rc = getGlobalRc();
  if (readRcFlag(rc)) {
    return true;
  }

  const env = getProcessEnv();
  if (readEnvFlag(env, QA_HUD_ENV_KEY)) {
    return true;
  }

  const devFlag = typeof __DEV__ === 'boolean' ? __DEV__ : false;
  if (devFlag && readEnvFlag(env, QA_DEV_ENV_KEY)) {
    return true;
  }

  return false;
}

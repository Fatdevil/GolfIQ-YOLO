export type RcSource = Record<string, unknown> | null | undefined;

function getGlobalRc(): RcSource {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  const holder = globalThis as typeof globalThis & { RC?: RcSource };
  return holder.RC ?? null;
}

function readEnvFlag(key: string): string | undefined {
  if (typeof process === 'undefined' || typeof process.env !== 'object') {
    return undefined;
  }
  const value = process.env[key];
  return typeof value === 'string' ? value : undefined;
}

function normalizeBoolean(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value !== 0 : false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }
  return false;
}

function readRcValue(source: RcSource, key: string): unknown {
  if (!source || typeof source !== 'object') {
    return undefined;
  }
  return (source as Record<string, unknown>)[key];
}

function readBooleanFlag({
  rcKey,
  envKey,
  fallback,
}: {
  rcKey: string;
  envKey: string;
  fallback: boolean;
}): boolean {
  const env = readEnvFlag(envKey);
  if (env !== undefined) {
    return normalizeBoolean(env);
  }
  const rc = getGlobalRc();
  const value = readRcValue(rc, rcKey);
  if (value !== undefined) {
    return normalizeBoolean(value);
  }
  return fallback;
}

const DRAG_KEY = 'tracer.drag.enabled';
const REQUIRE_CALIB_KEY = 'tracer.requireCalib';

export function tracerDragEnabled(): boolean {
  return readBooleanFlag({ rcKey: DRAG_KEY, envKey: 'TRACER_DRAG_ENABLED', fallback: false });
}

export function tracerRequireCalibration(): boolean {
  return readBooleanFlag({ rcKey: REQUIRE_CALIB_KEY, envKey: 'TRACER_REQUIRE_CALIB', fallback: false });
}

export function __setTracerRcForTests(rc: RcSource | null): void {
  if (typeof globalThis === 'undefined') {
    return;
  }
  const holder = globalThis as typeof globalThis & { RC?: RcSource };
  if (rc === null) {
    delete holder.RC;
    return;
  }
  holder.RC = rc;
}

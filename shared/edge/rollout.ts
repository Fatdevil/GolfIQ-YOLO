export type RcRecord = Record<string, unknown> | null | undefined;

export interface EdgeRolloutConfig {
  enabled: boolean;
  percent: number;
  kill: boolean;
}

export interface EdgeRolloutDecision extends EdgeRolloutConfig {
  deviceId: string;
  bucket: number;
  enforced: boolean;
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const DEFAULT_CONFIG: EdgeRolloutConfig = {
  enabled: false,
  percent: 0,
  kill: false,
};

function getGlobalObject(): typeof globalThis & { RC?: RcRecord } {
  return globalThis as typeof globalThis & { RC?: RcRecord };
}

function readRcValue(rc: RcRecord, key: string): unknown {
  if (!rc || typeof rc !== "object") {
    return undefined;
  }
  return (rc as Record<string, unknown>)[key];
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

function normalizePercent(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampPercent(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) {
      return clampPercent(parsed);
    }
  }
  return DEFAULT_CONFIG.percent;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_CONFIG.percent;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 100) {
    return 100;
  }
  return Math.floor(value);
}

function sanitizeDeviceId(deviceId: string | null | undefined): string {
  if (typeof deviceId === "string") {
    const trimmed = deviceId.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "unknown-device";
}

export function hashToBucket(id: string): number {
  const input = typeof id === "string" ? id : String(id ?? "");
  let hash = FNV_OFFSET_BASIS;
  for (let idx = 0; idx < input.length; idx += 1) {
    hash ^= input.charCodeAt(idx);
    hash = Math.imul(hash, FNV_PRIME);
  }
  const unsigned = hash >>> 0;
  return unsigned % 100;
}

export function inRollout(id: string, percent: number): boolean {
  const normalizedPercent = clampPercent(percent);
  if (normalizedPercent <= 0) {
    return false;
  }
  if (normalizedPercent >= 100) {
    return true;
  }
  return hashToBucket(id) < normalizedPercent;
}

export function readEdgeRolloutConfig(rc?: RcRecord): EdgeRolloutConfig {
  const source = rc ?? getGlobalObject().RC;
  const enabled = normalizeBoolean(readRcValue(source, "edge.rollout.enabled"));
  const percent = normalizePercent(readRcValue(source, "edge.rollout.percent"));
  const kill = normalizeBoolean(readRcValue(source, "edge.rollout.kill"));
  return {
    enabled,
    percent,
    kill,
  };
}

export interface EvaluateEdgeRolloutOptions {
  deviceId?: string | null;
  rc?: RcRecord;
  rcEnforceFlag?: boolean;
}

export function evaluateEdgeRollout(
  options: EvaluateEdgeRolloutOptions = {},
): EdgeRolloutDecision {
  const config = readEdgeRolloutConfig(options.rc);
  const deviceId = sanitizeDeviceId(options.deviceId ?? undefined);
  const bucket = hashToBucket(deviceId);
  const rcEnforce = options.rcEnforceFlag === true;
  const enforced = !config.kill && (rcEnforce || (config.enabled && inRollout(deviceId, config.percent)));
  return {
    ...config,
    deviceId,
    bucket,
    enforced,
  };
}

export function currentEdgeRolloutDecision(
  options: Omit<EvaluateEdgeRolloutOptions, "rc"> = {},
): EdgeRolloutDecision {
  return evaluateEdgeRollout({ ...options, rc: getGlobalObject().RC });
}

export type EdgeRolloutTelemetry = Pick<
  EdgeRolloutDecision,
  "enforced" | "percent" | "kill"
>;

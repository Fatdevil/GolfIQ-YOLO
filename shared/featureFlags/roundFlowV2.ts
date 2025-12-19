import { clearRemoteFeatureFlag, getRemoteFeatureFlag } from './remote';
import type { ResolvedFeatureFlag } from './types';

const TRUTHY_VALUES = new Set(["1", "true", "on", "yes", "enable", "enabled"]);
const FALSY_VALUES = new Set(["0", "false", "off", "no", "disable", "disabled"]);

export type RoundFlowV2RolloutReason =
  | "allowlist"
  | "percent"
  | "force_on"
  | "force_off"
  | "default_off"
  | "unknown";

const REASON_ALIASES: Record<string, RoundFlowV2RolloutReason> = {
  allowlist: "allowlist",
  allow_list: "allowlist",
  percent: "percent",
  rollout_percent: "percent",
  rollout_pct: "percent",
  force: "force_on",
  forceon: "force_on",
  force_on: "force_on",
  forced_on: "force_on",
  forceoff: "force_off",
  force_off: "force_off",
  forced_off: "force_off",
  default_off: "default_off",
  unknown: "unknown",
};

function readEnvFlag(): string | undefined {
  const importMetaEnv = typeof import.meta !== "undefined" ? (import.meta as unknown as { env?: Record<string, unknown> }) : null;
  const raw =
    importMetaEnv?.env?.VITE_FEATURE_ROUND_FLOW_V2 ??
    (typeof process !== "undefined" ? process.env?.EXPO_PUBLIC_FEATURE_ROUND_FLOW_V2 : undefined) ??
    (typeof process !== "undefined" ? process.env?.MOBILE_FEATURE_ROUND_FLOW_V2 : undefined) ??
    (typeof process !== "undefined" ? process.env?.FEATURE_ROUND_FLOW_V2 : undefined) ??
    (typeof process !== "undefined" ? process.env?.VITE_FEATURE_ROUND_FLOW_V2 : undefined);

  if (raw == null) return undefined;
  const value = String(raw).trim();
  return value.length > 0 ? value : undefined;
}

function normalizeFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;

  const normalized = value.toLowerCase();
  if (TRUTHY_VALUES.has(normalized)) return true;
  if (FALSY_VALUES.has(normalized)) return false;

  return defaultValue;
}

/**
 * Returns whether Start Round Flow v2 should be enabled.
 * Default: disabled to preserve existing flow unless explicitly rolled out.
 */
export function isRoundFlowV2Enabled(defaultValue = false): boolean {
  const remote: ResolvedFeatureFlag | null = getRemoteFeatureFlag("roundFlowV2");
  if (remote && typeof remote.enabled === "boolean") {
    return remote.enabled;
  }

  return getRoundFlowV2Fallback(defaultValue);
}

export function getRoundFlowV2Fallback(defaultValue = false): boolean {
  const raw = readEnvFlag();
  return normalizeFlag(raw, defaultValue);
}

export function getRoundFlowV2Reason(): string | undefined {
  const remote: ResolvedFeatureFlag | null = getRemoteFeatureFlag("roundFlowV2");
  if (!remote || typeof remote.reason !== "string") {
    return undefined;
  }
  const reason = remote.reason.trim();
  return reason.length > 0 ? reason : undefined;
}

export function normalizeRoundFlowV2Reason(raw?: string | null): RoundFlowV2RolloutReason | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.toLowerCase();
  return REASON_ALIASES[normalized] ?? "unknown";
}

export function __resetRoundFlowV2FlagCacheForTests() {
  clearRemoteFeatureFlag("roundFlowV2");
}

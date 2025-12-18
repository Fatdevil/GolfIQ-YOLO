const TRUTHY_VALUES = new Set(["1", "true", "on", "yes", "enable", "enabled"]);
const FALSY_VALUES = new Set(["0", "false", "off", "no", "disable", "disabled"]);

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
  const raw = readEnvFlag();
  return normalizeFlag(raw, defaultValue);
}

export function __resetRoundFlowV2FlagCacheForTests() {
  // placeholder for future caching parity
}

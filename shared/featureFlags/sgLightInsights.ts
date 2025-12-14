const TRUTHY_VALUES = new Set(["1", "true", "on", "yes", "enable", "enabled"]);
const FALSY_VALUES = new Set(["0", "false", "off", "no", "disable", "disabled"]);

function readEnvFlag(): string | undefined {
  const importMetaEnv = typeof import.meta !== "undefined" ? (import.meta as unknown as { env?: Record<string, unknown> }) : null;
  const raw =
    importMetaEnv?.env?.VITE_FEATURE_SG_LIGHT ??
    (typeof process !== "undefined" ? process.env?.EXPO_PUBLIC_FEATURE_SG_LIGHT : undefined) ??
    (typeof process !== "undefined" ? process.env?.MOBILE_FEATURE_SG_LIGHT : undefined) ??
    (typeof process !== "undefined" ? process.env?.FEATURE_SG_LIGHT : undefined) ??
    (typeof process !== "undefined" ? process.env?.VITE_FEATURE_SG_LIGHT : undefined);

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
 * Returns whether SG Light insights should be shown and tracked.
 * Default: enabled (true) so existing behavior is preserved unless explicitly disabled.
 */
export function isSgLightInsightsEnabled(defaultValue = true): boolean {
  const raw = readEnvFlag();
  return normalizeFlag(raw, defaultValue);
}

export function __resetSgLightFlagCacheForTests() {
  // noop placeholder to keep parity with potential future caching; intentionally empty
}

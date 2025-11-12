/** Returns true only for explicit truthy values. Default: false (off). */
export function isSGFeatureEnabled(): boolean {
  const raw = import.meta.env?.VITE_FEATURE_SG;
  if (raw == null) {
    return false;
  }
  const normalized = String(raw).trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'on' ||
    normalized === 'yes' ||
    normalized === 'enable'
  );
}

export function isSGFeatureEnabled(): boolean {
  const value = import.meta.env?.VITE_FEATURE_SG;
  if (value === undefined || value === null) {
    return true;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off';
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 100) {
    return 100;
  }
  return Math.floor(value);
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

export function clampRolloutPercent(percent: unknown): number {
  if (typeof percent === "number") {
    return clampPercent(percent);
  }
  if (typeof percent === "string") {
    const parsed = Number.parseFloat(percent.trim());
    if (Number.isFinite(parsed)) {
      return clampPercent(parsed);
    }
  }
  return 0;
}

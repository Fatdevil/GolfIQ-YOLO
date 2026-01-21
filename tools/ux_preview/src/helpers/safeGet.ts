export function safeGet<T>(value: T | null | undefined, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  return value;
}
